package com.filebonsai.transfers.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import com.filebonsai.storage.LocalObjectStorage;
import com.filebonsai.storage.R2Gateway;
import com.filebonsai.storage.R2ObjectStorage;
import com.filebonsai.transfers.application.UploadFailure;
import com.filebonsai.transfers.domain.UploadState;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.SQLDialect;
import org.jooq.impl.DSL;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class PostgresR2TransfersTest {
    private static final UUID WORKSPACE = UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final UUID PRINCIPAL = UUID.fromString("20000000-0000-4000-8000-000000000001");
    private static final EntryId ROOT = new EntryId(UUID.fromString("00000000-0000-4000-8000-000000000001"));

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    private static HikariDataSource dataSource;
    private static DSLContext database;

    @TempDir
    Path temporaryDirectory;

    private final CatalogScope scope = new CatalogScope(PRINCIPAL, WORKSPACE);
    private LocalObjectStorage staging;
    private FakeR2Gateway gateway;
    private R2ObjectStorage published;
    private PostgresLocalTransfers transfers;

    @BeforeAll
    static void migrate() {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl(POSTGRES.getJdbcUrl());
        hikari.setUsername(POSTGRES.getUsername());
        hikari.setPassword(POSTGRES.getPassword());
        dataSource = new HikariDataSource(hikari);
        Flyway.configure().dataSource(dataSource).load().migrate();
        database = DSL.using(dataSource, SQLDialect.POSTGRES);
    }

    @AfterAll
    static void closePool() {
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @BeforeEach
    void setup() throws Exception {
        database.execute("truncate table r2_parts, r2_objects, r2_attempts, upload_sessions, "
                + "idempotency_records, catalog_names, file_versions, physical_objects, "
                + "catalog_entries, workspace_members, workspaces cascade");
        database.execute("insert into workspaces (id, created_at) values (?, current_timestamp)", WORKSPACE);
        database.execute(
                "insert into workspace_members (workspace_id, principal_id, role, created_at) "
                        + "values (?, ?, 'owner', current_timestamp)",
                WORKSPACE,
                PRINCIPAL);
        database.execute(
                "insert into catalog_entries (id, workspace_id, kind, created_at, updated_at, current_version_id) "
                        + "values (?, ?, 'folder', current_timestamp, current_timestamp, null)",
                ROOT.value(),
                WORKSPACE);
        database.execute(
                "insert into catalog_names (id, workspace_id, parent_id, name, claim_kind, entry_id, expires_at, "
                        + "created_at) values (?, ?, null, 'Library', 'entry', ?, null, current_timestamp)",
                UUID.randomUUID(),
                WORKSPACE,
                ROOT.value());
        staging = new LocalObjectStorage(temporaryDirectory.resolve("staging"), 128L * 1024 * 1024);
        gateway = new FakeR2Gateway();
        published = new R2ObjectStorage(database, staging, gateway, java.time.Duration.ofMinutes(15), 1);
        transfers = new PostgresLocalTransfers(database, staging, published, java.time.Duration.ofHours(24));
    }

    @Test
    void smallAndEmptyBodiesPublishOnlyAfterCloudDigestVerification() throws Exception {
        byte[] body = "cloud bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        var upload = begin("small.bin", body);
        assertThat(transfers
                        .receive(scope, upload.id(), new ByteArrayInputStream(body))
                        .state())
                .isEqualTo(UploadState.STAGED);
        assertThat(transfers.complete(scope, upload.id()).state()).isEqualTo(UploadState.AVAILABLE);
        try (var download = transfers.open(scope, upload.entryId())) {
            assertThat(download.content().readAllBytes()).isEqualTo(body);
        }
        var empty = begin("empty.bin", new byte[0]);
        transfers.receive(scope, empty.id(), new ByteArrayInputStream(new byte[0]));
        assertThat(transfers.complete(scope, empty.id()).state()).isEqualTo(UploadState.AVAILABLE);
        assertThat(gateway.maxRequestBytes).isLessThanOrEqualTo(8 * 1024 * 1024);
    }

    @Test
    void multipartCompletionLostAfterSuccessReconcilesWithoutDuplicatePublication() throws Exception {
        byte[] body = new byte[9 * 1024 * 1024];
        Arrays.fill(body, (byte) 0x53);
        var upload = begin("large.bin", body);
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(body));
        gateway.loseCompleteResponse = true;
        assertThatThrownBy(() -> transfers.complete(scope, upload.id())).isInstanceOf(UploadFailure.class);
        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.RECONCILING);
        transfers.reconcile();
        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.AVAILABLE);
        assertThat(database.fetchCount(DSL.table(DSL.name("r2_parts")))).isEqualTo(2);
        assertThat(gateway.maxRequestBytes).isLessThanOrEqualTo(8 * 1024 * 1024);
        try (var download = transfers.open(scope, upload.entryId())) {
            assertThat(download.content().readAllBytes()).isEqualTo(body);
        }
    }

    @Test
    void lostSinglePutResponseReconcilesAndBadRemoteBytesNeverPublish() throws Exception {
        byte[] body = new byte[] {1, 2, 3};
        var upload = begin("uncertain.bin", body);
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(body));
        gateway.losePutResponse = true;
        assertThatThrownBy(() -> transfers.complete(scope, upload.id())).isInstanceOf(UploadFailure.class);
        transfers.reconcile();
        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.AVAILABLE);

        var corrupt = begin("corrupt.bin", body);
        transfers.receive(scope, corrupt.id(), new ByteArrayInputStream(body));
        gateway.corruptWrites = true;
        assertThatThrownBy(() -> transfers.complete(scope, corrupt.id())).isInstanceOf(UploadFailure.class);
        assertThat(transfers.get(scope, corrupt.id()).state()).isEqualTo(UploadState.RECONCILING);
        assertThat(database.fetchValue(
                        "select count(*) from physical_objects o join upload_sessions u on u.object_id = o.id "
                                + "where u.id = ?",
                        corrupt.id()))
                .isEqualTo(0L);
    }

    @Test
    void orphanCleanupPreservesUncertainFinalizationBytes() throws Exception {
        byte[] body = new byte[] {3, 2, 1};
        var upload = begin("pending.bin", body);
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(body));
        gateway.losePutResponse = true;
        assertThatThrownBy(() -> transfers.complete(scope, upload.id())).isInstanceOf(UploadFailure.class);
        database.execute("update r2_attempts set created_at = current_timestamp - interval '1 hour'");
        published.reconcileOrphans();
        assertThat(gateway.objects).hasSize(1);
        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.RECONCILING);
        transfers.reconcile();
        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.AVAILABLE);
    }

    @Test
    void delayedCreateUsesNewKeyAndDoesNotLeakProviderIdentifiersToCaller() throws Exception {
        byte[] body = new byte[9 * 1024 * 1024];
        var upload = begin("delayed.bin", body);
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(body));
        gateway.loseCreateResponse = true;
        assertThatThrownBy(() -> transfers.complete(scope, upload.id())).isInstanceOf(UploadFailure.class);
        transfers.reconcile();
        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.AVAILABLE);
        assertThat(database.fetchCount(DSL.table(DSL.name("r2_attempts")))).isEqualTo(2);
        assertThat(database.fetchValue("select count(distinct provider_key) from r2_attempts"))
                .isEqualTo(2L);
        assertThat(transfers.get(scope, upload.id()).toString()).doesNotContain("r2/objects/");
        assertThatThrownBy(() -> transfers.get(new CatalogScope(UUID.randomUUID(), WORKSPACE), upload.id()))
                .isInstanceOf(UploadFailure.class);
        database.execute("update r2_attempts set created_at = current_timestamp - interval '1 hour' "
                + "where state = 'INITIATING'");
        published.reconcileOrphans();
        assertThat(gateway.uploads).isEmpty();
        assertThat(database.fetchValue("select count(*) from r2_attempts where state = 'RETIRED'"))
                .isEqualTo(1L);
    }

    @Test
    void lostPartResponseResumesFromProviderListing() throws Exception {
        byte[] body = new byte[9 * 1024 * 1024];
        Arrays.fill(body, (byte) 7);
        var upload = begin("parts.bin", body);
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(body));
        gateway.losePartResponse = true;
        assertThatThrownBy(() -> transfers.complete(scope, upload.id())).isInstanceOf(UploadFailure.class);
        transfers.reconcile();
        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.AVAILABLE);
        assertThat(gateway.uploadPartCalls).isEqualTo(2);
    }

    @Test
    void repinsVerifiedBytesBeforeCatalogPublicationIfFirstRemoteKeyDisappears() throws Exception {
        byte[] body = new byte[] {9, 8, 7};
        var upload = begin("repin.bin", body);
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(body));
        String temporaryKey =
                (String) database.fetchValue("select accepted_temp_key from upload_sessions where id = ?", upload.id());
        String logicalKey =
                (String) database.fetchValue("select storage_key from upload_sessions where id = ?", upload.id());
        published.promote(temporaryKey, logicalKey, body.length, sha256(body));
        assertThat(published.verifies(logicalKey, body.length, sha256(body))).isTrue();
        String firstKey = (String) database.fetchValue(
                "select a.provider_key from r2_objects o join r2_attempts a on a.id = o.attempt_id "
                        + "where o.logical_key = ?",
                logicalKey);
        gateway.objects.remove(firstKey);
        assertThat(transfers.complete(scope, upload.id()).state()).isEqualTo(UploadState.AVAILABLE);
        String selectedKey = (String) database.fetchValue(
                "select a.provider_key from r2_objects o join r2_attempts a on a.id = o.attempt_id "
                        + "where o.logical_key = ?",
                logicalKey);
        assertThat(selectedKey).isNotEqualTo(firstKey);
    }

    @Test
    void staleReconciliationRetriesAfterProviderReturns() throws Exception {
        byte[] body = new byte[] {4, 5, 6};
        var upload = begin("outage.bin", body);
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(body));
        gateway.losePutResponse = true;
        assertThatThrownBy(() -> transfers.complete(scope, upload.id())).isInstanceOf(UploadFailure.class);
        gateway.unavailable = true;
        transfers.reconcile();
        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.RECONCILING);
        gateway.unavailable = false;
        database.execute(
                "update upload_sessions set created_at = current_timestamp - interval '2 hours', "
                        + "updated_at = current_timestamp - interval '1 hour' where id = ?",
                upload.id());
        transfers.reconcileStale(java.time.Duration.ofMinutes(30));
        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.AVAILABLE);
    }

    @Test
    void downloadRejectsUnexpectedBytesAndReleasesItsReadPermit() throws Exception {
        byte[] body = new byte[] {1, 2, 3};
        var upload = begin("bounded.bin", body);
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(body));
        transfers.complete(scope, upload.id());
        String logicalKey =
                (String) database.fetchValue("select storage_key from upload_sessions where id = ?", upload.id());
        String providerKey = (String) database.fetchValue(
                "select a.provider_key from r2_objects o join r2_attempts a on a.id = o.attempt_id "
                        + "where o.logical_key = ?",
                logicalKey);
        gateway.objects.put(providerKey, new byte[] {1, 2, 3, 4});
        assertThatThrownBy(() -> {
                    try (InputStream input = published.open(logicalKey)) {
                        input.readAllBytes();
                    }
                })
                .isInstanceOf(IOException.class);
        gateway.objects.put(providerKey, body);
        try (InputStream input = published.open(logicalKey)) {
            assertThat(input.readAllBytes()).isEqualTo(body);
        }
        try (InputStream input = published.open(logicalKey)) {
            assertThat(input.skip(2)).isEqualTo(2);
            assertThat(input.read()).isEqualTo(3);
            assertThat(input.read()).isEqualTo(-1);
        }
    }

    private com.filebonsai.transfers.application.UploadSession begin(String name, byte[] body) {
        return transfers.begin(
                scope, ROOT, new FileName(name), new ByteCount(body.length), sha256(body), UUID.randomUUID());
    }

    private static byte[] sha256(byte[] body) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(body);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static final class FakeR2Gateway implements R2Gateway {
        private final Map<String, byte[]> objects = new HashMap<>();
        private final Map<String, TreeMap<Integer, byte[]>> uploads = new HashMap<>();
        private final Map<String, String> uploadKeys = new HashMap<>();
        private boolean losePutResponse;
        private boolean loseCreateResponse;
        private boolean loseCompleteResponse;
        private boolean losePartResponse;
        private boolean corruptWrites;
        private boolean unavailable;
        private int maxRequestBytes;
        private int uploadPartCalls;

        @Override
        public void put(String key, byte[] body) throws IOException {
            maxRequestBytes = Math.max(maxRequestBytes, body.length);
            byte[] copy = body.clone();
            if (corruptWrites && copy.length > 0) {
                copy[0] ^= 1;
            }
            objects.put(key, copy);
            if (losePutResponse) {
                losePutResponse = false;
                throw new IOException("injected lost response");
            }
        }

        @Override
        public String createMultipart(String key) throws IOException {
            String id = UUID.randomUUID().toString();
            uploads.put(id, new TreeMap<>());
            uploadKeys.put(id, key);
            if (loseCreateResponse) {
                loseCreateResponse = false;
                throw new IOException("injected lost response");
            }
            return id;
        }

        @Override
        public String uploadPart(String key, String uploadId, int number, byte[] body) throws IOException {
            uploadPartCalls++;
            maxRequestBytes = Math.max(maxRequestBytes, body.length);
            uploads.get(uploadId).put(number, body.clone());
            if (losePartResponse) {
                losePartResponse = false;
                throw new IOException("injected lost response");
            }
            return '"' + java.util.HexFormat.of().formatHex(md5(body)) + '"';
        }

        @Override
        public List<Part> listParts(String key, String uploadId) throws IOException {
            if (!uploads.containsKey(uploadId)) {
                throw new MissingUploadException();
            }
            List<Part> parts = new ArrayList<>();
            uploads.get(uploadId)
                    .forEach((number, body) -> parts.add(new Part(number, uploadPartEtag(body), body.length)));
            return parts;
        }

        @Override
        public void completeMultipart(String key, String uploadId, List<Part> parts) throws IOException {
            int total = uploads.get(uploadId).values().stream()
                    .mapToInt(bytes -> bytes.length)
                    .sum();
            byte[] combined = new byte[total];
            int offset = 0;
            for (Part part : parts) {
                byte[] bytes = uploads.get(uploadId).get(part.number());
                System.arraycopy(bytes, 0, combined, offset, bytes.length);
                offset += bytes.length;
            }
            objects.put(key, combined);
            uploads.remove(uploadId);
            uploadKeys.remove(uploadId);
            if (loseCompleteResponse) {
                loseCompleteResponse = false;
                throw new IOException("injected lost response");
            }
        }

        @Override
        public void abortMultipart(String key, String uploadId) {
            uploads.remove(uploadId);
            uploadKeys.remove(uploadId);
        }

        @Override
        public List<Upload> listMultipartUploads(String keyPrefix) {
            List<Upload> found = new ArrayList<>();
            uploadKeys.forEach((id, key) -> {
                if (key.startsWith(keyPrefix)) {
                    found.add(new Upload(key, id));
                }
            });
            return found;
        }

        @Override
        public Long size(String key) throws IOException {
            if (unavailable) {
                throw new IOException("injected outage");
            }
            byte[] body = objects.get(key);
            return body == null ? null : (long) body.length;
        }

        @Override
        public InputStream open(String key) throws IOException {
            byte[] body = objects.get(key);
            if (body == null) {
                throw new IOException("missing object");
            }
            return new ByteArrayInputStream(body);
        }

        @Override
        public void delete(String key) {
            objects.remove(key);
        }

        private String uploadPartEtag(byte[] body) {
            return '"' + java.util.HexFormat.of().formatHex(md5(body)) + '"';
        }

        private byte[] md5(byte[] body) {
            try {
                return MessageDigest.getInstance("MD5").digest(body);
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        }
    }
}
