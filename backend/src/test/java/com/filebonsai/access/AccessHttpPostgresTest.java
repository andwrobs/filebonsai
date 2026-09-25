package com.filebonsai.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
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
    private static final UUID WORKSPACE_B = UUID.fromString("10000000-0000-4000-8000-000000000002");
    private static final UUID ROOT_B = UUID.fromString("00000000-0000-4000-8000-000000000002");
    private static final Path TRANSFER_ROOT =
            Path.of(System.getProperty("java.io.tmpdir"), "filebonsai-transfer-http-" + UUID.randomUUID());

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("filebonsai.catalog.cursor-secret-base64", () -> "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
        registry.add("filebonsai.access.cookie.secure", () -> false);
        registry.add("filebonsai.access.login.max-attempts", () -> 3);
        registry.add("filebonsai.storage.local.root", TRANSFER_ROOT::toString);
        registry.add("filebonsai.storage.provider", () -> "local");
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    DSLContext database;

    @Autowired
    LocalOwnerAccess access;

    private UUID workspaceA;
    private UUID rootA;

    @BeforeEach
    void setup() {
        database.execute("truncate table access_sessions, access_local_owner, access_principals, catalog_names, "
                + "catalog_entries, workspace_members, workspaces cascade");
        access.bootstrap(PASSWORD.toCharArray());
        UUID principal =
                database.fetchOne("select principal_id from access_local_owner").get(0, UUID.class);
        workspaceA = database.fetchOne("select workspace_id from workspace_members where principal_id = ?", principal)
                .get(0, UUID.class);
        rootA = database.fetchOne(
                        "select entry_id from catalog_names where workspace_id = ? and parent_id is null", workspaceA)
                .get(0, UUID.class);
        database.execute("insert into workspaces (id) values (?)", WORKSPACE_B);
        database.execute("insert into access_principals (id) values (?)", OTHER_PRINCIPAL);
        database.execute(
                "insert into workspace_members (workspace_id, principal_id, role) values (?, ?, 'owner')",
                WORKSPACE_B,
                OTHER_PRINCIPAL);
        root(WORKSPACE_B, ROOT_B, "Library B");
    }

    @Test
    void bootstrapCreatesOneCompletePacketAndRestartUsesTheSameCatalog() throws Exception {
        UUID principal =
                database.fetchOne("select principal_id from access_local_owner").get(0, UUID.class);
        assertThat(database.fetchOne("select count(*) from access_principals").get(0, Integer.class))
                .isEqualTo(2);
        assertThat(database.fetchOne("select count(*) from workspaces").get(0, Integer.class))
                .isEqualTo(2);
        assertThat(database.fetchOne(
                                "select role from workspace_members where workspace_id = ? and principal_id = ?",
                                workspaceA,
                                principal)
                        .get(0, String.class))
                .isEqualTo("owner");
        assertThat(database.fetchOne("select name from catalog_names where entry_id = ?", rootA)
                        .get(0, String.class))
                .isEqualTo("Library");

        assertThatThrownBy(() -> access.bootstrap("another secure password".toCharArray()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("A local owner is already configured");
        assertThat(database.fetchOne("select count(*) from access_local_owner").get(0, Integer.class))
                .isOne();
        assertThat(database.fetchOne("select count(*) from workspace_members where principal_id = ?", principal)
                        .get(0, Integer.class))
                .isOne();

        LocalOwnerAccess restarted =
                new LocalOwnerAccess(database, new PasswordHasher(), Clock.systemUTC(), Duration.ofHours(12));
        IssuedSession restartedSession = restarted.login(PASSWORD.toCharArray(), null);
        mvc.perform(get("/api/v1/entries/" + rootA)
                        .cookie(new Cookie(LocalOwnerAccess.SESSION_COOKIE, restartedSession.sessionToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(rootA.toString()))
                .andExpect(jsonPath("$.name").value("Library"));
    }

    @Test
    void bootstrapRollsBackTheWholePacketWhenRootCreationFails() {
        clearDatabase();
        database.execute("create function reject_bootstrap_root() returns trigger language plpgsql as $$ "
                + "begin raise exception 'injected bootstrap failure'; end $$");
        database.execute("create trigger reject_bootstrap_root before insert on catalog_names "
                + "for each row execute function reject_bootstrap_root()");
        try {
            assertThatThrownBy(() -> access.bootstrap(PASSWORD.toCharArray()))
                    .isInstanceOf(org.jooq.exception.DataAccessException.class);
        } finally {
            database.execute("drop trigger reject_bootstrap_root on catalog_names");
            database.execute("drop function reject_bootstrap_root()");
        }

        assertBootstrapRowCounts(0);
    }

    @Test
    void concurrentFirstBootstrapCommitsExactlyOneCompletePacket() throws Exception {
        clearDatabase();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var attempts = executor.invokeAll(List.<Callable<Boolean>>of(
                    () -> bootstrapSucceeded("first concurrent password"),
                    () -> bootstrapSucceeded("second concurrent password")));
            int successes = 0;
            for (var attempt : attempts) {
                if (attempt.get()) {
                    successes++;
                }
            }
            assertThat(successes).isOne();
        }

        assertBootstrapRowCounts(1);
        assertThat(database.fetchOne("select count(*) from catalog_names where parent_id is null and name = 'Library'")
                        .get(0, Integer.class))
                .isOne();
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
                        .content(mapper.writeValueAsString(java.util.Map.of("parentId", rootA, "name", "Denied"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));

        mvc.perform(get("/api/v1/entries/" + rootA)
                        .param("workspaceId", WORKSPACE_B.toString())
                        .cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(rootA.toString()));
        mvc.perform(get("/api/v1/catalog/root").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(rootA.toString()))
                .andExpect(jsonPath("$.parentId").isEmpty());
        mvc.perform(get("/api/v1/entries/" + ROOT_B)
                        .param("workspaceId", WORKSPACE_B.toString())
                        .cookie(session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ENTRY_NOT_FOUND"));
        mvc.perform(get("/api/v1/entries/" + ROOT_B + "/children").cookie(session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ENTRY_NOT_FOUND"));
        mvc.perform(post("/api/v1/folders")
                        .cookie(session, csrf)
                        .header(LocalOwnerAccess.CSRF_HEADER, csrf.getValue())
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType("application/json")
                        .content(mapper.writeValueAsString(java.util.Map.of("parentId", ROOT_B, "name", "Denied"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ENTRY_NOT_FOUND"));
        mvc.perform(get("/api/v1/entries/" + rootA)).andExpect(status().isUnauthorized());

        mvc.perform(post("/api/v1/folders")
                        .cookie(session, csrf)
                        .header(LocalOwnerAccess.CSRF_HEADER, csrf.getValue())
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType("application/json")
                        .content(mapper.writeValueAsString(java.util.Map.of("parentId", rootA, "name", "Allowed"))))
                .andExpect(status().isCreated());
    }

    @Test
    void uploadsAndDownloadsVerifiedOriginalsThroughTheAuthenticatedContract() throws Exception {
        Csrf anonymous = csrf();
        MvcResult login = login(anonymous, null, PASSWORD);
        Cookie session = login.getResponse().getCookie(LocalOwnerAccess.SESSION_COOKIE);
        Cookie csrf = login.getResponse().getCookie(LocalOwnerAccess.CSRF_COOKIE);
        byte[] content = "local transfer".getBytes(StandardCharsets.UTF_8);
        String digest =
                HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));

        var begun = mvc.perform(post("/api/v1/uploads")
                        .cookie(session, csrf)
                        .header(LocalOwnerAccess.CSRF_HEADER, csrf.getValue())
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType("application/json")
                        .content(mapper.writeValueAsString(java.util.Map.of(
                                "parentId",
                                rootA,
                                "name",
                                "transfer.txt",
                                "sizeBytes",
                                Integer.toString(content.length),
                                "sha256",
                                digest))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.state").value("INITIATED"))
                .andReturn();
        var upload = mapper.readTree(begun.getResponse().getContentAsString());
        String uploadId = upload.path("id").asText();
        String entryId = upload.path("entryId").asText();

        mvc.perform(put("/api/v1/uploads/" + uploadId + "/content")
                        .cookie(session, csrf)
                        .header(LocalOwnerAccess.CSRF_HEADER, csrf.getValue())
                        .contentType("application/octet-stream")
                        .content(content))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("STAGED"))
                .andExpect(jsonPath("$.computedSha256").value(digest));
        mvc.perform(post("/api/v1/uploads/" + uploadId + "/complete")
                        .cookie(session, csrf)
                        .header(LocalOwnerAccess.CSRF_HEADER, csrf.getValue()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("AVAILABLE"));
        var download = mvc.perform(
                        get("/api/v1/entries/" + entryId + "/content").cookie(session))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/octet-stream"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andReturn();
        assertThat(download.getResponse().getContentAsByteArray()).isEqualTo(content);
        assertThat(download.getResponse().getHeader("Content-Disposition")).contains("attachment");
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
        badLogin(anonymous, "short")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void persistsLoginThrottlingAndClearsFailuresAfterSuccessfulLogin() throws Exception {
        Csrf anonymous = csrf();
        badLogin(anonymous, "totally wrong password")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        badLogin(anonymous, "totally wrong password")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

        login(anonymous, null, PASSWORD);
        assertThat(database.fetchOne("select failed_login_attempts from access_local_owner")
                        .get(0, Integer.class))
                .isZero();

        badLogin(anonymous, "totally wrong password").andExpect(status().isUnauthorized());
        badLogin(anonymous, "totally wrong password").andExpect(status().isUnauthorized());
        badLogin(anonymous, "totally wrong password")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "900"))
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(jsonPath("$.message").value("Request could not be processed"));

        LocalOwnerAccess restarted =
                new LocalOwnerAccess(database, new PasswordHasher(), Clock.systemUTC(), Duration.ofHours(12));
        assertThatThrownBy(() -> restarted.login(PASSWORD.toCharArray(), null))
                .isInstanceOfSatisfying(
                        AccessFailure.class,
                        failure -> assertThat(failure.reason()).isEqualTo(AccessFailure.Reason.RATE_LIMITED));
    }

    @Test
    void credentialResetInvalidatesSessionsAndIsIdempotentByRequestId() throws Exception {
        Csrf anonymous = csrf();
        MvcResult initialLogin = login(anonymous, null, PASSWORD);
        Cookie initialSession = initialLogin.getResponse().getCookie(LocalOwnerAccess.SESSION_COOKIE);

        UUID resetId = UUID.randomUUID();
        String replacement = "a new correct horse battery staple";
        access.resetCredentials(resetId, replacement.toCharArray());
        assertThat(access.authenticate(initialSession.getValue())).isEmpty();

        badLogin(anonymous, PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        MvcResult replacementLogin = login(anonymous, null, replacement);
        Cookie replacementSession = replacementLogin.getResponse().getCookie(LocalOwnerAccess.SESSION_COOKIE);
        assertThat(access.authenticate(replacementSession.getValue())).isPresent();

        access.resetCredentials(resetId, replacement.toCharArray());
        assertThat(access.authenticate(replacementSession.getValue())).isPresent();

        String newest = "a third correct horse battery staple";
        access.resetCredentials(UUID.randomUUID(), newest.toCharArray());
        MvcResult newestLogin = login(anonymous, null, newest);
        Cookie newestSession = newestLogin.getResponse().getCookie(LocalOwnerAccess.SESSION_COOKIE);
        access.resetCredentials(resetId, replacement.toCharArray());
        assertThat(access.authenticate(newestSession.getValue())).isPresent();
        assertThatThrownBy(() -> access.resetCredentials(resetId, "a conflicting replacement password".toCharArray()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Credential reset request conflicts with an existing request");
    }

    @Test
    void exportsTheAuthenticatedPostgresContract() throws Exception {
        String schema = mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        var document = mapper.readTree(schema);
        var login = document.path("paths").path("/api/v1/auth/login").path("post");
        assertThat(login.path("responses")
                        .path("200")
                        .path("content")
                        .path("application/json")
                        .path("schema")
                        .path("$ref")
                        .asText())
                .endsWith("/AccessSessionResponse");
        assertThat(login.path("responses").path("429").path("headers").has("Retry-After"))
                .isTrue();
        assertThat(login.path("responses").has("400")).isTrue();
        assertThat(login.path("responses").has("403")).isTrue();
        assertThat(login.path("parameters")).anySatisfy(parameter -> {
            assertThat(parameter.path("name").asText()).isEqualTo(LocalOwnerAccess.CSRF_HEADER);
            assertThat(parameter.path("in").asText()).isEqualTo("header");
            assertThat(parameter.path("required").asBoolean()).isTrue();
        });
        assertThat(login.path("security").isArray()).isTrue();
        assertThat(login.path("security")).isEmpty();
        assertThat(document.path("paths")
                        .path("/api/v1/auth/logout")
                        .path("post")
                        .path("responses")
                        .has("204"))
                .isTrue();
        assertThat(document.path("paths")
                        .path("/api/v1/auth/logout")
                        .path("post")
                        .path("responses")
                        .has("401"))
                .isTrue();
        assertThat(document.path("paths")
                        .path("/api/v1/auth/logout")
                        .path("post")
                        .path("responses")
                        .has("403"))
                .isTrue();
        assertThat(document.path("paths")
                        .path("/api/v1/auth/logout")
                        .path("post")
                        .path("responses")
                        .path("401")
                        .path("content")
                        .has("application/json"))
                .isTrue();
        assertThat(document.path("paths")
                        .path("/api/v1/auth/me")
                        .path("get")
                        .path("responses")
                        .path("200")
                        .path("content")
                        .path("application/json")
                        .path("schema")
                        .path("$ref")
                        .asText())
                .endsWith("/AccessSessionResponse");
        assertThat(document.path("paths")
                        .path("/api/v1/auth/me")
                        .path("get")
                        .path("responses")
                        .has("401"))
                .isTrue();
        assertThat(document.path("paths")
                        .path("/api/v1/entries/{id}")
                        .path("get")
                        .isMissingNode())
                .isFalse();
        assertThat(document.path("paths").path("/api/v1/uploads").path("post").isMissingNode())
                .isFalse();
        assertThat(document.path("paths")
                        .path("/api/v1/uploads/{id}/content")
                        .path("put")
                        .isMissingNode())
                .isFalse();
        assertThat(document.path("paths")
                        .path("/api/v1/entries/{id}/content")
                        .path("get")
                        .isMissingNode())
                .isFalse();
        assertThat(document.path("components")
                        .path("schemas")
                        .path("UploadResponse")
                        .path("properties")
                        .path("sizeBytes")
                        .path("type")
                        .asText())
                .isEqualTo("string");
        for (var operation : java.util.List.of(
                document.path("paths").path("/api/v1/entries/{id}").path("get"),
                document.path("paths").path("/api/v1/entries/{id}/children").path("get"),
                document.path("paths").path("/api/v1/folders").path("post"))) {
            assertThat(operation.path("responses").has("401")).isTrue();
        }
        var createFolder = document.path("paths").path("/api/v1/folders").path("post");
        assertThat(createFolder.path("responses").has("403")).isTrue();
        assertThat(createFolder.path("parameters")).anySatisfy(parameter -> {
            assertThat(parameter.path("name").asText()).isEqualTo(LocalOwnerAccess.CSRF_HEADER);
            assertThat(parameter.path("in").asText()).isEqualTo("header");
            assertThat(parameter.path("required").asBoolean()).isTrue();
        });
        assertThat(document.path("components")
                        .path("securitySchemes")
                        .path("sessionCookie")
                        .path("in")
                        .asText())
                .isEqualTo("cookie");
        assertThat(document.path("components")
                        .path("schemas")
                        .path("AccessLoginRequest")
                        .path("properties")
                        .path("password")
                        .path("minLength")
                        .asInt())
                .isEqualTo(1);
        assertThat(document.path("components")
                        .path("schemas")
                        .path("AccessLoginRequest")
                        .path("properties")
                        .path("password")
                        .path("pattern")
                        .asText())
                .isEqualTo("^[\\s\\S]*\\S[\\s\\S]*$");
        Path output = Path.of("target/contract/openapi-postgres.json");
        Files.createDirectories(output.getParent());
        Files.writeString(output, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(document) + "\n");
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

    private org.springframework.test.web.servlet.ResultActions badLogin(Csrf csrf, String password) throws Exception {
        return mvc.perform(post("/api/v1/auth/login")
                .cookie(csrf.cookie())
                .header(LocalOwnerAccess.CSRF_HEADER, csrf.token())
                .contentType("application/json")
                .content(mapper.writeValueAsString(java.util.Map.of("password", password))));
    }

    private boolean bootstrapSucceeded(String password) {
        try {
            access.bootstrap(password.toCharArray());
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private void assertBootstrapRowCounts(int expected) {
        for (String table : List.of(
                "access_principals",
                "access_local_owner",
                "workspaces",
                "workspace_members",
                "catalog_entries",
                "catalog_names")) {
            assertThat(database.fetchOne("select count(*) from " + table).get(0, Integer.class))
                    .as(table)
                    .isEqualTo(expected);
        }
    }

    private void clearDatabase() {
        database.execute("truncate table access_sessions, access_local_owner, access_principals, catalog_names, "
                + "catalog_entries, workspace_members, workspaces cascade");
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
