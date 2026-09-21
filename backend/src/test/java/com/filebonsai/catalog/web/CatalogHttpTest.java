package com.filebonsai.catalog.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.filebonsai.catalog.support.FixtureCatalog;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
        properties = {
            "filebonsai.fixture.cursor-secret=contract-test-secret",
            "filebonsai.fixture.fixed-time=2026-02-01T00:00:00Z"
        })
@AutoConfigureMockMvc
@ActiveProfiles("fixture")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class CatalogHttpTest {
    private static final String FIXTURE_REQUEST_ID = "00000000-0000-4000-8000-000000000000";
    private static final String ROOT = FixtureCatalog.ROOT.value().toString();
    private static final String FILE = FixtureCatalog.FILE.value().toString();
    private static final String EMPTY = FixtureCatalog.EMPTY.value().toString();

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Test
    void filesFoldersAndRootHaveDistinctShapes() throws Exception {
        mvc.perform(get("/api/v1/entries/" + FILE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("file"))
                .andExpect(jsonPath("$.currentVersion.sizeBytes").value("9007199254740993"))
                .andExpect(header().string("Cache-Control", "no-store"));
        var root = mapper.readTree(mvc.perform(get("/api/v1/entries/" + ROOT))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
        assertThat(root.has("parentId")).isTrue();
        assertThat(root.get("parentId").isNull()).isTrue();
        assertThat(root.has("currentVersion")).isFalse();
        mvc.perform(get("/api/v1/catalog/root"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(ROOT))
                .andExpect(jsonPath("$.parentId").isEmpty())
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    void creationReplayAndConflictReturnUsefulErrors() throws Exception {
        String key = UUID.randomUUID().toString();
        String body = mapper.writeValueAsString(Map.of("parentId", ROOT, "name", "HTTP Café"));
        var first = mvc.perform(post("/api/v1/folders")
                        .header("Idempotency-Key", key)
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse();
        var replay = mvc.perform(post("/api/v1/folders")
                        .header("Idempotency-Key", key)
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse();
        assertThat(replay.getContentAsString()).isEqualTo(first.getContentAsString());
        assertThat(replay.getHeader("Location"))
                .isEqualTo("/api/v1/entries/"
                        + mapper.readTree(first.getContentAsString()).get("id").asText());
        mvc.perform(post("/api/v1/folders")
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NAME_CONFLICT"));
        mvc.perform(post("/api/v1/folders")
                        .header("Idempotency-Key", key)
                        .contentType("application/json")
                        .content(body.replace("HTTP Café", "Changed")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IDEMPOTENCY_CONFLICT"));
    }

    @Test
    void invalidNamesProduceFieldErrorsWithRequestCorrelation() throws Exception {
        var response = mvc.perform(post("/api/v1/folders")
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType("application/json")
                        .content(mapper.writeValueAsString(Map.of("parentId", ROOT, "name", "a/b"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("name"))
                .andReturn()
                .getResponse();
        assertThat(mapper.readTree(response.getContentAsString())
                        .get("requestId")
                        .asText())
                .isEqualTo(response.getHeader("X-Request-Id"));
    }

    @Test
    void malformedInputCannotBecomeServerError() throws Exception {
        for (String body : List.of(
                "{}",
                "{",
                "null",
                "[]",
                "{\"parentId\":\"1-1-1-1-1\",\"name\":\"x\"}",
                "{\"parentId\":\"" + ROOT + "\",\"name\":5}",
                "{\"parentId\":\"" + ROOT + "\",\"name\":\"x\",\"extra\":true}",
                "{\"parentId\":\"" + ROOT + "\",\"name\":\"x\",\"name\":\"y\"}")) {
            mvc.perform(post("/api/v1/folders")
                            .header("Idempotency-Key", UUID.randomUUID())
                            .contentType("application/json")
                            .content(body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.requestId").isString())
                    .andExpect(jsonPath("$.fieldErrors").isArray());
        }
        mvc.perform(post("/api/v1/folders").contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        for (String id : List.of("nonsense", "1-1-1-1-1")) {
            mvc.perform(get("/api/v1/entries/" + id)).andExpect(status().isBadRequest());
        }
        for (String limit : List.of("0", "101", "nope")) {
            mvc.perform(get("/api/v1/entries/" + ROOT + "/children").param("limit", limit))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void missingEntriesAndWrongFolderKindReturnStableErrors() throws Exception {
        mvc.perform(get("/api/v1/entries/" + UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ENTRY_NOT_FOUND"));
        mvc.perform(get("/api/v1/entries/" + FILE + "/children"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("NOT_A_FOLDER"));
        mvc.perform(get("/api/v1/entries/" + ROOT + "/children").param("cursor", "bad"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CURSOR"));
    }

    @Test
    void frameworkErrorsUseTheCommonEnvelope() throws Exception {
        mvc.perform(put("/api/v1/entries/" + ROOT))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.status").value(405));
        mvc.perform(get("/api/v1/missing"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
        mvc.perform(post("/api/v1/folders").contentType("text/plain").content("x"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.status").value(415));
    }

    @Test
    void exportsSpringdocAndRepresentativeResponses() throws Exception {
        Path output = Path.of("target/contract");
        Files.createDirectories(output.resolve("fixtures"));
        String schema = mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        JsonNode document = mapper.readTree(schema);
        JsonNode schemas = document.path("components").path("schemas");
        assertThat(document.path("paths").size()).isEqualTo(4);
        assertThat(document.path("paths")
                        .path("/api/v1/catalog/root")
                        .path("get")
                        .path("operationId")
                        .asText())
                .isEqualTo("getWorkspaceRoot");
        assertThat(schemas.path("EntryResponse").path("oneOf").size()).isEqualTo(2);
        assertThat(schemas.path("EntryResponse")
                        .path("discriminator")
                        .path("propertyName")
                        .asText())
                .isEqualTo("kind");
        assertThat(schemas.path("CurrentVersionResponse")
                        .path("properties")
                        .path("sizeBytes")
                        .path("type")
                        .asText())
                .isEqualTo("string");
        assertThat(schemas.path("FolderEntryResponse")
                        .path("properties")
                        .path("parentId")
                        .path("nullable")
                        .asBoolean())
                .isTrue();
        assertThat(schemas.path("FolderEntryResponse").path("properties").has("currentVersion"))
                .isFalse();
        assertThat(schemas.path("ApiErrorResponse")
                        .path("properties")
                        .path("code")
                        .has("enum"))
                .isFalse();
        Files.writeString(
                output.resolve("openapi-fixture.json"),
                mapper.writerWithDefaultPrettyPrinter().writeValueAsString(document) + "\n");
        for (var fixture : Map.of(
                        "root", "/entries/" + ROOT,
                        "workspace-root", "/catalog/root",
                        "file", "/entries/" + FILE,
                        "folder", "/entries/" + EMPTY,
                        "empty-page", "/entries/" + EMPTY + "/children",
                        "page", "/entries/" + ROOT + "/children?limit=1")
                .entrySet()) {
            String json = mvc.perform(get("/api/v1" + fixture.getValue()))
                    .andExpect(status().isOk())
                    .andReturn()
                    .getResponse()
                    .getContentAsString();
            Files.writeString(output.resolve("fixtures/" + fixture.getKey() + ".json"), json + "\n");
        }
        String error = mvc.perform(get("/api/v1/entries/ffffffff-ffff-4fff-8fff-ffffffffffff"))
                .andExpect(status().isNotFound())
                .andReturn()
                .getResponse()
                .getContentAsString();
        ObjectNode errorFixture = (ObjectNode) mapper.readTree(error);
        errorFixture.put("requestId", FIXTURE_REQUEST_ID);
        Files.writeString(output.resolve("fixtures/error.json"), errorFixture + "\n");
        ObjectNode future = errorFixture.deepCopy();
        future.put("code", "FUTURE_SERVER_ERROR");
        future.put("newField", "ignored by old clients");
        Files.writeString(output.resolve("fixtures/future-error.json"), future + "\n");
    }
}
