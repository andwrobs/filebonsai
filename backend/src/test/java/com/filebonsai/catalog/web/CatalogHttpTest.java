package com.filebonsai.catalog.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.domain.Entry;
import com.filebonsai.catalog.domain.FileName;
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
    private static final String PRE_SORT_CURSOR =
            "eyJ2ZXJzaW9uIjoxLCJ3b3Jrc3BhY2VJZCI6IjEwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSIsImZvbGRlcklkIjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAxIiwic29ydCI6Im5hbWUtaWQtdXRmOC1hc2MtdjEiLCJuYW1lIjoiSXRhbHkucGRmIiwiaWQiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDIifQ.k9bZ6t5TQXDkU8F3K5E75U7MIl_kiIsIkKXVVpbbh7g";

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    FixtureCatalog fixture;

    @Test
    void filesFoldersAndRootHaveDistinctShapes() throws Exception {
        mvc.perform(get("/api/v1/entries/" + FILE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("file"))
                .andExpect(jsonPath("$.currentVersion.sizeBytes").value("9007199254740993"))
                .andExpect(jsonPath("$.currentVersion.sha256")
                        .value("4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358"))
                .andExpect(jsonPath("$.currentVersion.storageConnectionName").value("Local disk"))
                .andExpect(jsonPath("$.versionCount").value(1))
                .andExpect(header().string("Cache-Control", "no-store"));
        var root = mapper.readTree(mvc.perform(get("/api/v1/entries/" + ROOT))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
        assertThat(root.has("parentId")).isTrue();
        assertThat(root.get("parentId").isNull()).isTrue();
        assertThat(root.get("ancestors").isArray()).isTrue();
        assertThat(root.get("ancestors")).isEmpty();
        assertThat(root.has("currentVersion")).isFalse();
        mvc.perform(get("/api/v1/catalog/root"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(ROOT))
                .andExpect(jsonPath("$.parentId").isEmpty())
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    void folderDetailsIncludeOrderedAncestorsWithoutAddingThemToListings() throws Exception {
        String parent = mapper.readTree(mvc.perform(post("/api/v1/folders")
                                .header("Idempotency-Key", UUID.randomUUID())
                                .contentType("application/json")
                                .content(mapper.writeValueAsString(Map.of("parentId", ROOT, "name", "Travel"))))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .get("id")
                .asText();
        String child = mapper.readTree(mvc.perform(post("/api/v1/folders")
                                .header("Idempotency-Key", UUID.randomUUID())
                                .contentType("application/json")
                                .content(mapper.writeValueAsString(Map.of("parentId", parent, "name", "Photos"))))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .get("id")
                .asText();

        mvc.perform(get("/api/v1/entries/" + parent))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ancestors[*].name").value(contains("Library")));
        mvc.perform(get("/api/v1/entries/" + child))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ancestors[*].id").value(contains(ROOT, parent)))
                .andExpect(jsonPath("$.ancestors[*].name").value(contains("Library", "Travel")));
        var page = mapper.readTree(mvc.perform(get("/api/v1/entries/" + parent + "/children"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
        assertThat(page.get("entries").get(0).has("ancestors")).isFalse();
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
    void childrenFollowTheRequestedOrderAndRejectUnknownOrCoercedValues() throws Exception {
        String children = "/api/v1/entries/" + ROOT + "/children";
        mvc.perform(get(children).param("sort", "size").param("order", "desc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entries[*].name").value(contains("Italy.pdf", "Recipes")));
        mvc.perform(get(children).param("sort", "size").param("order", "desc").param("foldersFirst", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entries[*].name").value(contains("Recipes", "Italy.pdf")));
        for (var invalid : List.of(Map.of("sort", "Name"), Map.of("sort", "kind"), Map.of("order", "DESC"))) {
            var field = invalid.keySet().iterator().next();
            mvc.perform(get(children).param(field, invalid.get(field)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.fieldErrors[0].field").value(field))
                    .andExpect(jsonPath("$.fieldErrors[0].code").value("UNSUPPORTED_VALUE"));
        }
        for (String coerced : List.of("yes", "1", "TRUE")) {
            mvc.perform(get(children).param("foldersFirst", coerced))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
        var first = mapper.readTree(mvc.perform(get(children).param("limit", "1"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
        String cursor = first.get("nextCursor").asText();
        mvc.perform(get(children).param("cursor", cursor).param("sort", "name")).andExpect(status().isOk());
        // The default-order cursor exported before other orders existed, signed with the same fixture key.
        mvc.perform(get(children).param("cursor", PRE_SORT_CURSOR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entries[*].name").value(contains("Recipes")));
        for (var other :
                List.of(Map.of("order", "desc"), Map.of("foldersFirst", "true"), Map.of("sort", "updatedAt"))) {
            var field = other.keySet().iterator().next();
            mvc.perform(get(children).param("cursor", cursor).param(field, other.get(field)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_CURSOR"));
        }
    }

    @Test
    void kindLimitsChildrenToFoldersOrFilesAndBindsCursorsToIt() throws Exception {
        String children = "/api/v1/entries/" + ROOT + "/children";
        mvc.perform(post("/api/v1/folders")
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType("application/json")
                        .content(mapper.writeValueAsString(Map.of("parentId", ROOT, "name", "Travel"))))
                .andExpect(status().isCreated());
        mvc.perform(get(children).param("kind", "folder"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entries[*].name").value(contains("Recipes", "Travel")))
                .andExpect(jsonPath("$.entries[*].kind").value(contains("folder", "folder")));
        mvc.perform(get(children).param("kind", "file"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entries[*].name").value(contains("Italy.pdf")));
        mvc.perform(get(children).param("kind", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entries[*].name").value(contains("Italy.pdf", "Recipes", "Travel")));
        for (String invalid : List.of("Folder", "folders", "FILE")) {
            mvc.perform(get(children).param("kind", invalid))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("kind"))
                    .andExpect(jsonPath("$.fieldErrors[0].code").value("UNSUPPORTED_VALUE"));
        }
        var first =
                mapper.readTree(mvc.perform(get(children).param("limit", "1").param("kind", "folder"))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.entries[*].name").value(contains("Recipes")))
                        .andReturn()
                        .getResponse()
                        .getContentAsString());
        String cursor = first.get("nextCursor").asText();
        mvc.perform(get(children).param("cursor", cursor).param("kind", "folder"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entries[*].name").value(contains("Travel")))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
        for (var mismatch : List.of(Map.<String, String>of(), Map.of("kind", "file"), Map.of("kind", ""))) {
            var request = get(children).param("cursor", cursor);
            mismatch.forEach(request::param);
            mvc.perform(request)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_CURSOR"));
        }
        // An unfiltered cursor is not valid under a filter, and the pre-sort token still works unfiltered.
        String unfiltered = mapper.readTree(mvc.perform(get(children).param("limit", "1"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .get("nextCursor")
                .asText();
        mvc.perform(get(children).param("cursor", unfiltered).param("kind", "folder"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CURSOR"));
        mvc.perform(get(children).param("cursor", PRE_SORT_CURSOR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entries[*].name").value(contains("Recipes", "Travel")));
        mvc.perform(get(children).param("cursor", PRE_SORT_CURSOR).param("kind", "folder"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CURSOR"));
    }

    @Test
    void movingReportsEachItemAndReplaysTheOriginalResult() throws Exception {
        mvc.perform(get("/api/v1/entries/" + FILE))
                .andExpect(jsonPath("$.revision").value(1));
        mvc.perform(get("/api/v1/entries/" + ROOT + "/children"))
                .andExpect(jsonPath("$.entries[*].revision").value(contains(1, 1)));
        String archive = createFolder(ROOT, "Archive");
        String missing = UUID.randomUUID().toString();
        String key = UUID.randomUUID().toString();
        String body = moveBody(archive, Map.of(FILE, 1, EMPTY, 1, missing, 4));

        String first = mvc.perform(post("/api/v1/entries/move")
                        .header("Idempotency-Key", key)
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.items[*].entryId").value(contains(FILE, EMPTY, missing)))
                .andExpect(jsonPath("$.items[*].outcome").value(contains("MOVED", "MOVED", "NOT_FOUND")))
                .andExpect(jsonPath("$.items[0].revision").value(2))
                .andExpect(jsonPath("$.items[0].previousParentId").value(ROOT))
                .andExpect(jsonPath("$.items[2].revision").isEmpty())
                .andExpect(jsonPath("$.items[2].previousParentId").isEmpty())
                .andReturn()
                .getResponse()
                .getContentAsString();
        var notFound = mapper.readTree(first).get("items").get(2);
        assertThat(notFound.has("revision") && notFound.get("revision").isNull())
                .isTrue();
        assertThat(notFound.has("previousParentId")
                        && notFound.get("previousParentId").isNull())
                .isTrue();
        mvc.perform(get("/api/v1/entries/" + FILE))
                .andExpect(jsonPath("$.parentId").value(archive))
                .andExpect(jsonPath("$.revision").value(2));
        mvc.perform(get("/api/v1/entries/" + EMPTY))
                .andExpect(jsonPath("$.revision").value(2))
                .andExpect(jsonPath("$.ancestors[*].id").value(contains(ROOT, archive)));

        mvc.perform(post("/api/v1/entries/move")
                        .header("Idempotency-Key", key)
                        .contentType("application/json")
                        .content(moveBody(archive, Map.of(missing, 4, EMPTY, 1, FILE, 1))))
                .andExpect(status().isOk())
                .andExpect(result ->
                        assertThat(result.getResponse().getContentAsString()).isEqualTo(first));
        mvc.perform(post("/api/v1/entries/move")
                        .header("Idempotency-Key", key)
                        .contentType("application/json")
                        .content(moveBody(archive, Map.of(FILE, 2))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IDEMPOTENCY_CONFLICT"));
        mvc.perform(post("/api/v1/entries/move")
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType("application/json")
                        .content(moveBody(ROOT, Map.of(FILE, 1, ROOT, 1))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].outcome").value(contains("CANNOT_MOVE_ROOT", "ANCESTOR_NOT_MOVED")));
    }

    @Test
    void invalidMovesFailWithoutMovingAnything() throws Exception {
        String archive = createFolder(ROOT, "Archive");
        for (String body : List.of(
                "{}",
                "{\"destinationId\":\"" + archive + "\",\"items\":[]}",
                "{\"destinationId\":\"" + archive + "\",\"items\":[{\"entryId\":\"" + FILE + "\"}]}",
                "{\"destinationId\":\"" + archive + "\",\"items\":[{\"entryId\":\"" + FILE
                        + "\",\"expectedRevision\":0}]}",
                "{\"destinationId\":\"" + archive + "\",\"items\":[{\"entryId\":\"" + FILE
                        + "\",\"expectedRevision\":\"1\"}]}",
                "{\"destinationId\":\"" + archive + "\",\"items\":[{\"entryId\":\"" + FILE
                        + "\",\"expectedRevision\":1.5}]}",
                "{\"destinationId\":\"" + archive + "\",\"items\":[null]}",
                "{\"destinationId\":\"" + archive + "\",\"items\":[{\"entryId\":\"" + FILE
                        + "\",\"expectedRevision\":1,\"extra\":true}]}")) {
            mvc.perform(post("/api/v1/entries/move")
                            .header("Idempotency-Key", UUID.randomUUID())
                            .contentType("application/json")
                            .content(body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.requestId").isString());
        }
        String duplicate = "{\"destinationId\":\"" + archive + "\",\"items\":[{\"entryId\":\"" + FILE
                + "\",\"expectedRevision\":1},{\"entryId\":\"" + FILE + "\",\"expectedRevision\":1}]}";
        mvc.perform(post("/api/v1/entries/move")
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType("application/json")
                        .content(duplicate))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("items"))
                .andExpect(jsonPath("$.fieldErrors[0].code").value("DUPLICATE_ENTRY"));
        mvc.perform(post("/api/v1/entries/move")
                        .contentType("application/json")
                        .content(moveBody(archive, Map.of(FILE, 1))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mvc.perform(post("/api/v1/entries/move")
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType("application/json")
                        .content(moveBody(UUID.randomUUID().toString(), Map.of(FILE, 1))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ENTRY_NOT_FOUND"));
        mvc.perform(post("/api/v1/entries/move")
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType("application/json")
                        .content(moveBody(FILE, Map.of(EMPTY, 1))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("NOT_A_FOLDER"));
        mvc.perform(get("/api/v1/entries/" + FILE))
                .andExpect(jsonPath("$.parentId").value(ROOT))
                .andExpect(jsonPath("$.revision").value(1));
    }

    @Test
    void creatingAFolderPastTheDepthLimitConflicts() throws Exception {
        var scope = new CatalogScope(FixtureCatalog.PRINCIPAL, FixtureCatalog.WORKSPACE);
        var parent = FixtureCatalog.ROOT;
        for (int depth = 1; depth <= Entry.MAXIMUM_FOLDER_DEPTH; depth++) {
            parent = fixture.create(scope, parent, new FileName("Level " + depth), UUID.randomUUID())
                    .id();
        }
        mvc.perform(post("/api/v1/folders")
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType("application/json")
                        .content(mapper.writeValueAsString(Map.of("parentId", parent.value(), "name", "Too deep"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DEPTH_LIMIT_EXCEEDED"));
        mvc.perform(get("/api/v1/entries/" + parent.value()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ancestors.length()").value(1024));
    }

    private String createFolder(String parentId, String name) throws Exception {
        return mapper.readTree(mvc.perform(post("/api/v1/folders")
                                .header("Idempotency-Key", UUID.randomUUID())
                                .contentType("application/json")
                                .content(mapper.writeValueAsString(Map.of("parentId", parentId, "name", name))))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .get("id")
                .asText();
    }

    private String moveBody(String destinationId, Map<String, Integer> revisions) throws Exception {
        return mapper.writeValueAsString(Map.of(
                "destinationId",
                destinationId,
                "items",
                revisions.entrySet().stream()
                        .map(entry -> Map.of("entryId", entry.getKey(), "expectedRevision", entry.getValue()))
                        .toList()));
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
        assertThat(document.path("paths").size()).isEqualTo(5);
        assertThat(document.path("paths")
                        .path("/api/v1/catalog/root")
                        .path("get")
                        .path("operationId")
                        .asText())
                .isEqualTo("getWorkspaceRoot");
        assertThat(schemas.path("EntryResponse").path("oneOf").size()).isEqualTo(2);
        assertThat(schemas.path("EntryDetailsResponse").path("oneOf").size()).isEqualTo(2);
        assertThat(schemas.path("FolderDetailsResponse").path("required").toString())
                .contains("\"ancestors\"");
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
        JsonNode version = schemas.path("CurrentVersionResponse");
        assertThat(version.path("properties").path("sha256").path("nullable").asBoolean())
                .isTrue();
        assertThat(version.path("properties").path("sha256").path("pattern").asText())
                .isEqualTo("^[0-9a-f]{64}$");
        assertThat(version.path("required").toString()).contains("\"sha256\"", "\"storageConnectionName\"");
        assertThat(version.path("properties").fieldNames())
                .toIterable()
                .containsExactlyInAnyOrder("id", "sizeBytes", "sha256", "storageConnectionName");
        JsonNode file = schemas.path("FileEntryResponse");
        assertThat(file.path("properties").path("versionCount").path("type").asText())
                .isEqualTo("integer");
        assertThat(file.path("required").toString()).contains("\"versionCount\"");
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
        String moved = mvc.perform(post("/api/v1/entries/move")
                        .header("Idempotency-Key", "50000000-0000-4000-8000-000000000001")
                        .contentType("application/json")
                        .content(moveBody(EMPTY, Map.of(FILE, 1, "ffffffff-ffff-4fff-8fff-ffffffffffff", 1))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        Files.writeString(output.resolve("fixtures/move-result.json"), moved + "\n");
        ObjectNode future = errorFixture.deepCopy();
        future.put("code", "FUTURE_SERVER_ERROR");
        future.put("newField", "ignored by old clients");
        Files.writeString(output.resolve("fixtures/future-error.json"), future + "\n");
    }
}
