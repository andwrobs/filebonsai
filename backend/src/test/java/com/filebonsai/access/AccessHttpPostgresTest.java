package com.filebonsai.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import org.jooq.DSLContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class AccessHttpPostgresTest {
    private static final String PASSWORD = "correct horse battery staple";
    private static final UUID OTHER_PRINCIPAL = UUID.fromString("20000000-0000-4000-8000-000000000002");
    private static final UUID WORKSPACE_A = UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final UUID WORKSPACE_B = UUID.fromString("10000000-0000-4000-8000-000000000002");
    private static final UUID ROOT_A = UUID.fromString("00000000-0000-4000-8000-000000000001");
    private static final UUID ROOT_B = UUID.fromString("00000000-0000-4000-8000-000000000002");

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("filebonsai.catalog.cursor-secret-base64", () -> "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
        registry.add("filebonsai.access.cookie.secure", () -> false);
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    DSLContext database;

    @Autowired
    LocalOwnerAccess access;

    @BeforeEach
    void setup() {
        database.execute("truncate table access_sessions, access_local_owner, access_principals, catalog_names, "
                + "catalog_entries, workspace_members, workspaces cascade");
        access.bootstrap(PASSWORD.toCharArray());
        UUID principal =
                database.fetchOne("select principal_id from access_local_owner").get(0, UUID.class);
        database.execute("insert into workspaces (id) values (?)", WORKSPACE_A);
        database.execute("insert into workspaces (id) values (?)", WORKSPACE_B);
        database.execute(
                "insert into workspace_members (workspace_id, principal_id, role) values (?, ?, 'owner')",
                WORKSPACE_A,
                principal);
        database.execute("insert into access_principals (id) values (?)", OTHER_PRINCIPAL);
        database.execute(
                "insert into workspace_members (workspace_id, principal_id, role) values (?, ?, 'owner')",
                WORKSPACE_B,
                OTHER_PRINCIPAL);
        root(WORKSPACE_A, ROOT_A, "Library A");
        root(WORKSPACE_B, ROOT_B, "Library B");
    }

    @Test
    void persistsRotatedSessionsAcrossStoreInstancesAndInvalidatesLogout() throws Exception {
        Csrf anonymous = csrf();
        MvcResult firstLogin = login(anonymous, null, PASSWORD);
        Cookie firstSession = firstLogin.getResponse().getCookie(LocalOwnerAccess.SESSION_COOKIE);
        Cookie firstCsrf = firstLogin.getResponse().getCookie(LocalOwnerAccess.CSRF_COOKIE);
        assertThat(firstSession.isHttpOnly()).isTrue();
        assertThat(firstSession.getSecure()).isFalse();
        assertThat(firstSession.getValue()).doesNotContain(PASSWORD);

        assertThat(access.authenticate(firstSession.getValue())).isPresent();
        LocalOwnerAccess restarted =
                new LocalOwnerAccess(database, new PasswordHasher(), Clock.systemUTC(), Duration.ofHours(12));
        assertThat(restarted.authenticate(firstSession.getValue())).isPresent();
        MvcResult secondLogin = login(new Csrf(firstCsrf), firstSession, PASSWORD);
        Cookie secondSession = secondLogin.getResponse().getCookie(LocalOwnerAccess.SESSION_COOKIE);
        Cookie secondCsrf = secondLogin.getResponse().getCookie(LocalOwnerAccess.CSRF_COOKIE);
        assertThat(secondSession.getValue()).isNotEqualTo(firstSession.getValue());
        assertThat(access.authenticate(firstSession.getValue())).isEmpty();
        assertThat(access.authenticate(secondSession.getValue())).isPresent();

        mvc.perform(get("/api/v1/auth/me").cookie(firstSession)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/logout")
                        .cookie(secondSession, secondCsrf)
                        .header(LocalOwnerAccess.CSRF_HEADER, secondCsrf.getValue()))
                .andExpect(status().isNoContent());
        assertThat(access.authenticate(secondSession.getValue())).isEmpty();
        mvc.perform(get("/api/v1/auth/me").cookie(secondSession)).andExpect(status().isUnauthorized());
    }

    @Test
    void protectsWritesWithCsrfAndDerivesCatalogScopeFromTheAuthenticatedMembership() throws Exception {
        Csrf anonymous = csrf();
        MvcResult login = login(anonymous, null, PASSWORD);
        Cookie session = login.getResponse().getCookie(LocalOwnerAccess.SESSION_COOKIE);
        Cookie csrf = login.getResponse().getCookie(LocalOwnerAccess.CSRF_COOKIE);

        mvc.perform(post("/api/v1/folders")
                        .cookie(session)
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType("application/json")
                        .content(mapper.writeValueAsString(java.util.Map.of("parentId", ROOT_A, "name", "Denied"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));

        mvc.perform(get("/api/v1/entries/" + ROOT_A)
                        .param("workspaceId", WORKSPACE_B.toString())
                        .cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(ROOT_A.toString()));
        mvc.perform(get("/api/v1/entries/" + ROOT_B)
                        .param("workspaceId", WORKSPACE_B.toString())
                        .cookie(session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ENTRY_NOT_FOUND"));
        mvc.perform(get("/api/v1/entries/" + ROOT_A)).andExpect(status().isUnauthorized());

        mvc.perform(post("/api/v1/folders")
                        .cookie(session, csrf)
                        .header(LocalOwnerAccess.CSRF_HEADER, csrf.getValue())
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType("application/json")
                        .content(mapper.writeValueAsString(java.util.Map.of("parentId", ROOT_A, "name", "Allowed"))))
                .andExpect(status().isCreated());
    }

    @Test
    void returnsGenericFailuresWithoutSerializingCredentials() throws Exception {
        Csrf anonymous = csrf();
        String invalidPassword = "totally wrong password";
        var response = mvc.perform(post("/api/v1/auth/login")
                        .cookie(anonymous.cookie())
                        .header(LocalOwnerAccess.CSRF_HEADER, anonymous.token())
                        .contentType("application/json")
                        .content(mapper.writeValueAsString(java.util.Map.of("password", invalidPassword))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
                .andReturn()
                .getResponse();
        assertThat(response.getContentAsString())
                .doesNotContain(invalidPassword)
                .doesNotContain(PASSWORD);
    }

    private Csrf csrf() throws Exception {
        var response = mvc.perform(get("/api/v1/auth/csrf"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse();
        return new Csrf(response.getCookie(LocalOwnerAccess.CSRF_COOKIE));
    }

    private MvcResult login(Csrf csrf, Cookie session, String password) throws Exception {
        var request = post("/api/v1/auth/login")
                .cookie(csrf.cookie())
                .header(LocalOwnerAccess.CSRF_HEADER, csrf.token())
                .contentType("application/json")
                .content(mapper.writeValueAsString(java.util.Map.of("password", password)));
        if (session != null) {
            request.cookie(session);
        }
        return mvc.perform(request).andExpect(status().isOk()).andReturn();
    }

    private void root(UUID workspace, UUID root, String name) {
        database.execute(
                "insert into catalog_entries (id, workspace_id, kind, created_at, updated_at, current_version_id) "
                        + "values (?, ?, 'folder', current_timestamp, current_timestamp, null)",
                root,
                workspace);
        database.execute(
                "insert into catalog_names (id, workspace_id, parent_id, name, claim_kind, entry_id, expires_at, created_at) "
                        + "values (?, ?, null, ?, 'entry', ?, null, current_timestamp)",
                UUID.randomUUID(),
                workspace,
                name,
                root);
    }

    private record Csrf(Cookie cookie) {
        String token() {
            return cookie.getValue();
        }
    }
}
