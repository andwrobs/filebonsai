package com.filebonsai.transfers.persistence;

import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import com.filebonsai.storage.LocalObjectStorage;
import com.filebonsai.storage.R2Gateway;
import com.filebonsai.storage.R2ObjectStorage;
import com.filebonsai.transfers.application.UploadFailure;
import com.filebonsai.transfers.application.UploadSession;
import com.filebonsai.transfers.domain.UploadState;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.SQLDialect;
import org.jooq.impl.DSL;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.io.TempDir;
import org.testcontainers.containers.PostgreSQLContainer;
import software.amazon.awssdk.services.s3.S3Client;

/** Explicitly gated, destructive proof against a disposable real Cloudflare R2 bucket. */
class RealR2CompatibilityProofTest {
    private static final int MULTIPART_BYTES = 9 * 1024 * 1024;
    private static final int PART_BYTES = 8 * 1024 * 1024;
    private static final Duration TRANSFER_TIMEOUT = Duration.ofMinutes(15);

    @TempDir
    Path temporaryDirectory;

    private DSLContext database;
    private CatalogScope scope;
    private EntryId root;
    private LocalObjectStorage staging;
    private ObservedGateway gateway;
    private PostgresLocalTransfers transfers;
    private R2ObjectStorage published;
    private String prefix;
    private String scenario = "setup";
    private long peakStagingBytes;
    private UploadSession downloadableSmall;

    @Test
    void faultWrapperKeepsSuccessfulProviderEffectsBeforeDroppingResponses() throws Exception {
        InMemoryGateway fake = new InMemoryGateway();
        ObservedGateway observed = new ObservedGateway(fake);
        byte[] body = R2ProofPayloads.body(4096);
        observed.losePutResponse = true;
        expectIoFailure(() -> observed.put("synthetic", body));
        require(java.security.MessageDigest.isEqual(fake.body, body), "lost PUT erased provider success");
        observed.deferCreate = true;
        expectIoFailure(() -> observed.createMultipart("synthetic"));
        require(observed.listMultipartUploads("synthetic").isEmpty(), "deferred create was visible too early");
        observed.materializePendingCreate();
        require(observed.listMultipartUploads("synthetic").size() == 1, "deferred create did not appear");
        observed.losePartResponse = true;
        expectIoFailure(() -> observed.uploadPart("synthetic", fake.uploadId, 1, body));
        require(observed.listParts("synthetic", fake.uploadId).size() == 1, "lost part erased provider success");
        observed.loseCompleteResponse = true;
        expectIoFailure(() ->
                observed.completeMultipart("synthetic", fake.uploadId, observed.listParts("synthetic", fake.uploadId)));
        require(fake.completed, "lost completion erased provider success");
        observed.abortMultipart("synthetic", fake.uploadId);
        require(observed.listMultipartUploads("synthetic").isEmpty(), "abort left an upload listed");
    }

    @Test
    @EnabledIfSystemProperty(named = "filebonsai.r2.proof", matches = "true")
    void provesRealProviderBehaviorAndCleansItsObjects() {
        String bucket = required("FILEBONSAI_R2_PROOF_BUCKET");
        boolean cleaned = false;
        try (PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");
                S3Client client = new LocalTransferConfiguration()
                        .r2Client(
                                required("FILEBONSAI_R2_PROOF_ACCOUNT_ID"),
                                required("FILEBONSAI_R2_PROOF_JURISDICTION"),
                                Path.of(required("FILEBONSAI_R2_PROOF_ACCESS_KEY_ID_FILE")),
                                Path.of(required("FILEBONSAI_R2_PROOF_SECRET_ACCESS_KEY_FILE")),
                                Duration.ofMinutes(5),
                                1)) {
            postgres.start();
            HikariConfig hikari = new HikariConfig();
            hikari.setJdbcUrl(postgres.getJdbcUrl());
            hikari.setUsername(postgres.getUsername());
            hikari.setPassword(postgres.getPassword());
            try (HikariDataSource dataSource = new HikariDataSource(hikari)) {
                Flyway.configure().dataSource(dataSource).load().migrate();
                database = DSL.using(dataSource, SQLDialect.POSTGRES);
                UUID workspace = UUID.randomUUID();
                scope = new CatalogScope(UUID.randomUUID(), workspace);
                root = new EntryId(UUID.randomUUID());
                prefix = "r2/objects/" + workspace + "/";
                R2Gateway live = new LocalTransferConfiguration().r2Gateway(client, bucket);
                gateway = new ObservedGateway(live);
                require(
                        client.listObjectsV2(request -> request.bucket(bucket).prefix(prefix))
                                .contents()
                                .isEmpty(),
                        "proof prefix was not empty");
                require(live.listMultipartUploads(prefix).isEmpty(), "proof multipart prefix was not empty");
                seedWorkspace();
                staging = new LocalObjectStorage(
                        temporaryDirectory.resolve("staging"), 128L * 1024 * 1024, TRANSFER_TIMEOUT, 1);
                restartServices();
                try {
                    runScenarios();
                } finally {
                    try {
                        cleanup(client, bucket);
                        cleaned = true;
                    } catch (Throwable cleanupFailure) {
                        scenario = "cleanup";
                        throw cleanupFailure;
                    }
                }
            }
        } catch (Throwable failure) {
            throw new AssertionError("R2 proof failed at " + scenario + "; provider details suppressed; cleanup "
                    + (cleaned ? "verified" : "requires operator inspection"));
        }
    }

    private void runScenarios() throws Exception {
        byte[] empty = R2ProofPayloads.body(0);
        byte[] small = R2ProofPayloads.body(4096);
        byte[] multipart = R2ProofPayloads.body(MULTIPART_BYTES);
        measure("zero_byte", empty, () -> uploadAndDownload("zero.bin", empty));
        measure("single_put_download", small, () -> downloadableSmall = uploadAndDownload("small.bin", small));
        measure("download_concurrency_bound", small, () -> {
            try (var first = transfers.open(scope, downloadableSmall.entryId())) {
                expectUploadFailure(() -> transfers.open(scope, downloadableSmall.entryId()));
                require(first.content().readAllBytes().length == small.length, "held download ended early");
            }
            checkDownload(downloadableSmall, small);
        });
        measure("size_digest_rejection", small, () -> {
            UploadSession wrongDigest = begin("wrong-digest.bin", small);
            byte[] changed = small.clone();
            changed[0] ^= 1;
            expectUploadFailure(() -> transfers.receive(scope, wrongDigest.id(), new ByteArrayInputStream(changed)));
            require(
                    transfers.get(scope, wrongDigest.id()).state() == UploadState.INITIATED,
                    "digest rejection did not reset intent");
            transfers.cancel(scope, wrongDigest.id());
            UploadSession wrongSize = begin("wrong-size.bin", small);
            expectUploadFailure(() ->
                    transfers.receive(scope, wrongSize.id(), new ByteArrayInputStream(new byte[small.length - 1])));
            require(
                    transfers.get(scope, wrongSize.id()).state() == UploadState.INITIATED,
                    "size rejection did not reset intent");
            transfers.cancel(scope, wrongSize.id());
            expectUploadFailure(() -> transfers.begin(
                    scope,
                    root,
                    new FileName("over-cap.bin"),
                    new ByteCount(128L * 1024 * 1024 + 1),
                    R2ProofPayloads.sha256(small),
                    UUID.randomUUID()));
        });
        measure("multipart_part_retry_listing", multipart, () -> {
            gateway.losePartResponse = true;
            int beforeParts = gateway.partCalls;
            int beforeLists = gateway.listPartsCalls;
            UploadSession session = staged("part-retry.bin", multipart);
            expectUploadFailure(() -> transfers.complete(scope, session.id()));
            require(
                    transfers.get(scope, session.id()).state() == UploadState.RECONCILING,
                    "part response was not uncertain");
            restartServices();
            transfers.reconcile();
            requireAvailable(session);
            require(gateway.partCalls - beforeParts == 2, "accepted part was uploaded again");
            require(gateway.listPartsCalls > beforeLists, "parts were not listed");
            checkDownload(session, multipart);
        });
        measure("multipart_completion_timeout_after_success", multipart, () -> {
            gateway.loseCompleteResponse = true;
            UploadSession session = staged("completion-timeout.bin", multipart);
            expectUploadFailure(() -> transfers.complete(scope, session.id()));
            restartServices();
            transfers.reconcile();
            requireAvailable(session);
            checkDownload(session, multipart);
        });
        measure("single_put_lost_response_restart", small, () -> {
            gateway.losePutResponse = true;
            UploadSession session = staged("put-timeout.bin", small);
            expectUploadFailure(() -> transfers.complete(scope, session.id()));
            restartServices();
            transfers.reconcile();
            requireAvailable(session);
            checkDownload(session, small);
        });
        measure("delayed_create_empty_listing_duplicate_attempt_cleanup", multipart, () -> {
            gateway.deferCreate = true;
            UploadSession session = staged("delayed-create.bin", multipart);
            expectUploadFailure(() -> transfers.complete(scope, session.id()));
            require(gateway.pendingCreateKey != null, "create fault did not retain its key");
            require(
                    gateway.listMultipartUploads(gateway.pendingCreateKey).isEmpty(),
                    "delayed create listing was not empty");
            gateway.materializePendingCreate();
            restartServices();
            transfers.reconcile();
            requireAvailable(session);
            require(
                    database.fetchValue(
                                    "select count(distinct provider_key) from r2_attempts "
                                            + "where logical_key = (select storage_key from upload_sessions where id = ?)",
                                    session.id())
                            .equals(2L),
                    "retry did not use a second key");
            require(
                    !gateway.delayedUploadId.equals(database.fetchValue(
                            "select upload_id from r2_attempts "
                                    + "where logical_key = (select storage_key from upload_sessions where id = ?) "
                                    + "and upload_id is not null",
                            session.id())),
                    "retry reused the delayed upload ID");
            database.execute("update r2_attempts set created_at = current_timestamp - interval '1 hour' "
                    + "where state = 'INITIATING'");
            published.reconcileOrphans();
            require(
                    gateway.listMultipartUploads(gateway.delayedCreateKey).isEmpty(),
                    "orphan multipart upload was not aborted");
            checkDownload(session, multipart);
        });
        measure("remote_digest_rejection", small, () -> {
            gateway.corruptPut = true;
            UploadSession session = staged("remote-corrupt.bin", small);
            expectUploadFailure(() -> transfers.complete(scope, session.id()));
            require(
                    transfers.get(scope, session.id()).state() == UploadState.RECONCILING,
                    "remote digest mismatch was published");
            require(
                    database.fetchValue(
                                    "select count(*) from physical_objects where id = "
                                            + "(select object_id from upload_sessions where id = ?)",
                                    session.id())
                            .equals(0L),
                    "corrupt remote object became catalog content");
        });
        measure("provider_abort", multipart, () -> {
            String key = prefix + "probe-abort";
            String uploadId = gateway.createMultipart(key);
            gateway.uploadPart(key, uploadId, 1, R2ProofPayloads.body(PART_BYTES));
            require(gateway.listParts(key, uploadId).size() == 1, "abort setup part was not listed");
            gateway.abortMultipart(key, uploadId);
            require(gateway.listMultipartUploads(key).isEmpty(), "aborted upload remained listed");
        });
    }

    private UploadSession begin(String name, byte[] body) {
        return transfers.begin(
                scope,
                root,
                new FileName(name),
                new ByteCount(body.length),
                R2ProofPayloads.sha256(body),
                UUID.randomUUID());
    }

    private UploadSession staged(String name, byte[] body) throws IOException {
        UploadSession session = begin(name, body);
        require(
                transfers
                                .receive(scope, session.id(), new ByteArrayInputStream(body))
                                .state()
                        == UploadState.STAGED,
                "body did not stage");
        try (var files = Files.walk(temporaryDirectory.resolve("staging"))) {
            peakStagingBytes = Math.max(
                    peakStagingBytes,
                    files.filter(Files::isRegularFile)
                            .mapToLong(path -> path.toFile().length())
                            .sum());
        }
        return session;
    }

    private UploadSession uploadAndDownload(String name, byte[] body) throws Exception {
        UploadSession session = staged(name, body);
        require(transfers.complete(scope, session.id()).state() == UploadState.AVAILABLE, "completion did not publish");
        checkDownload(session, body);
        return session;
    }

    private void checkDownload(UploadSession session, byte[] expected) throws Exception {
        try (var download = transfers.open(scope, session.entryId())) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[64 * 1024];
            long count = 0;
            int read;
            while ((read = download.content().read(buffer)) != -1) {
                digest.update(buffer, 0, read);
                count += read;
            }
            require(count == expected.length, "download length differed");
            require(
                    MessageDigest.isEqual(R2ProofPayloads.sha256(expected), digest.digest()),
                    "download digest differed");
        }
    }

    private void requireAvailable(UploadSession session) {
        require(
                transfers.get(scope, session.id()).state() == UploadState.AVAILABLE,
                "restart did not publish the verified object");
    }

    private void restartServices() {
        published = new R2ObjectStorage(database, staging, gateway, TRANSFER_TIMEOUT, 1);
        transfers = new PostgresLocalTransfers(database, staging, published, Duration.ofHours(24));
    }

    private void seedWorkspace() {
        database.execute("insert into workspaces (id, created_at) values (?, current_timestamp)", scope.workspaceId());
        database.execute(
                "insert into workspace_members (workspace_id, principal_id, role, created_at) "
                        + "values (?, ?, 'owner', current_timestamp)",
                scope.workspaceId(),
                scope.principalId());
        database.execute(
                "insert into catalog_entries (id, workspace_id, kind, created_at, updated_at, current_version_id) "
                        + "values (?, ?, 'folder', current_timestamp, current_timestamp, null)",
                root.value(),
                scope.workspaceId());
        database.execute(
                "insert into catalog_names (id, workspace_id, parent_id, name, claim_kind, entry_id, "
                        + "expires_at, created_at) values (?, ?, null, 'Library', 'entry', ?, null, current_timestamp)",
                UUID.randomUUID(),
                scope.workspaceId(),
                root.value());
    }

    private void cleanup(S3Client client, String bucket) throws IOException {
        for (R2Gateway.Upload upload : gateway.listMultipartUploads(prefix)) {
            gateway.abortMultipart(upload.key(), upload.id());
        }
        for (int pass = 0; pass < 20; pass++) {
            var page = client.listObjectsV2(request -> request.bucket(bucket).prefix(prefix));
            if (page.contents().isEmpty()) {
                break;
            }
            page.contents()
                    .forEach(object -> client.deleteObject(
                            request -> request.bucket(bucket).key(object.key())));
        }
        require(gateway.listMultipartUploads(prefix).isEmpty(), "multipart cleanup incomplete");
        require(
                client.listObjectsV2(request -> request.bucket(bucket).prefix(prefix))
                        .contents()
                        .isEmpty(),
                "object cleanup incomplete");
        System.out.println("R2_PROOF cleanup=PASS");
    }

    private void measure(String name, byte[] body, CheckedOperation operation) throws Exception {
        scenario = name;
        gateway.resetMetrics();
        peakStagingBytes = 0;
        AtomicBoolean sampling = new AtomicBoolean(true);
        AtomicLong peakHeap = new AtomicLong();
        Thread sampler = Thread.ofPlatform().daemon().start(() -> {
            while (sampling.get()) {
                Runtime runtime = Runtime.getRuntime();
                peakHeap.accumulateAndGet(runtime.totalMemory() - runtime.freeMemory(), Math::max);
                try {
                    Thread.sleep(10);
                } catch (InterruptedException ignored) {
                    return;
                }
            }
        });
        long started = System.nanoTime();
        try {
            operation.run();
        } finally {
            sampling.set(false);
            sampler.join();
        }
        long elapsedMillis = Duration.ofNanos(System.nanoTime() - started).toMillis();
        require(gateway.maxRequestBytes <= PART_BYTES, "provider request exceeded 8 MiB");
        require(gateway.maxInFlight <= 1, "provider calls exceeded configured concurrency");
        System.out.println("R2_PROOF scenario=" + name + " status=PASS bytes=" + body.length + " sha256="
                + R2ProofPayloads.hexSha256(body) + " elapsed_ms=" + elapsedMillis + " heap_peak_bytes="
                + peakHeap.get() + " max_request_bytes=" + gateway.maxRequestBytes + " provider_read_bytes="
                + gateway.readBytes + " staging_peak_bytes=" + peakStagingBytes + " max_provider_calls="
                + gateway.maxInFlight);
    }

    private static void expectUploadFailure(CheckedOperation operation) throws Exception {
        try {
            operation.run();
        } catch (UploadFailure expected) {
            return;
        }
        throw new AssertionError("expected transfer rejection did not occur");
    }

    private static void expectIoFailure(CheckedOperation operation) throws Exception {
        try {
            operation.run();
        } catch (IOException expected) {
            return;
        }
        throw new AssertionError("expected response loss did not occur");
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("R2 proof configuration missing");
        }
        return value;
    }

    private interface CheckedOperation {
        void run() throws Exception;
    }

    private static final class InMemoryGateway implements R2Gateway {
        private final String uploadId = "synthetic-upload-id";
        private byte[] body;
        private Part part;
        private boolean created;
        private boolean completed;

        @Override
        public void put(String key, byte[] content) {
            body = content.clone();
        }

        @Override
        public String createMultipart(String key) {
            created = true;
            return uploadId;
        }

        @Override
        public String uploadPart(String key, String id, int number, byte[] content) {
            part = new Part(number, "synthetic-etag", content.length);
            return part.etag();
        }

        @Override
        public List<Part> listParts(String key, String id) {
            return part == null ? List.of() : List.of(part);
        }

        @Override
        public void completeMultipart(String key, String id, List<Part> parts) {
            completed = true;
        }

        @Override
        public void abortMultipart(String key, String id) {
            created = false;
        }

        @Override
        public List<Upload> listMultipartUploads(String keyPrefix) {
            return created ? List.of(new Upload(keyPrefix, uploadId)) : List.of();
        }

        @Override
        public Long size(String key) {
            return body == null ? null : (long) body.length;
        }

        @Override
        public InputStream open(String key) {
            return new ByteArrayInputStream(body);
        }

        @Override
        public void delete(String key) {
            body = null;
        }
    }

    private static final class ObservedGateway implements R2Gateway {
        private final R2Gateway delegate;
        private int partCalls;
        private int listPartsCalls;
        private int inFlight;
        private int maxInFlight;
        private int maxRequestBytes;
        private long readBytes;
        private boolean losePartResponse;
        private boolean loseCompleteResponse;
        private boolean losePutResponse;
        private boolean deferCreate;
        private boolean corruptPut;
        private String pendingCreateKey;
        private String delayedCreateKey;
        private String delayedUploadId;

        private ObservedGateway(R2Gateway delegate) {
            this.delegate = delegate;
        }

        private void resetMetrics() {
            maxInFlight = 0;
            maxRequestBytes = 0;
            readBytes = 0;
        }

        private void entered() {
            maxInFlight = Math.max(maxInFlight, ++inFlight);
        }

        private void exited() {
            inFlight--;
        }

        @Override
        public void put(String key, byte[] body) throws IOException {
            entered();
            try {
                maxRequestBytes = Math.max(maxRequestBytes, body.length);
                if (corruptPut) {
                    corruptPut = false;
                    byte[] changed = body.clone();
                    changed[0] ^= 1;
                    delegate.put(key, changed);
                } else {
                    delegate.put(key, body);
                }
                if (losePutResponse) {
                    losePutResponse = false;
                    throw new IOException("injected lost PUT response");
                }
            } finally {
                exited();
            }
        }

        @Override
        public String createMultipart(String key) throws IOException {
            entered();
            try {
                if (deferCreate) {
                    deferCreate = false;
                    pendingCreateKey = key;
                    throw new IOException("injected delayed create response");
                }
                return delegate.createMultipart(key);
            } finally {
                exited();
            }
        }

        private void materializePendingCreate() throws IOException {
            require(pendingCreateKey != null, "no delayed create was pending");
            delayedCreateKey = pendingCreateKey;
            delayedUploadId = delegate.createMultipart(delayedCreateKey);
            pendingCreateKey = null;
        }

        @Override
        public String uploadPart(String key, String uploadId, int number, byte[] body) throws IOException {
            entered();
            try {
                maxRequestBytes = Math.max(maxRequestBytes, body.length);
                partCalls++;
                String etag = delegate.uploadPart(key, uploadId, number, body);
                if (losePartResponse) {
                    losePartResponse = false;
                    throw new IOException("injected lost part response");
                }
                return etag;
            } finally {
                exited();
            }
        }

        @Override
        public List<Part> listParts(String key, String uploadId) throws IOException {
            entered();
            try {
                listPartsCalls++;
                return delegate.listParts(key, uploadId);
            } finally {
                exited();
            }
        }

        @Override
        public void completeMultipart(String key, String uploadId, List<Part> parts) throws IOException {
            entered();
            try {
                delegate.completeMultipart(key, uploadId, parts);
                if (loseCompleteResponse) {
                    loseCompleteResponse = false;
                    throw new IOException("injected lost completion response");
                }
            } finally {
                exited();
            }
        }

        @Override
        public void abortMultipart(String key, String uploadId) throws IOException {
            entered();
            try {
                delegate.abortMultipart(key, uploadId);
            } finally {
                exited();
            }
        }

        @Override
        public List<Upload> listMultipartUploads(String keyPrefix) throws IOException {
            entered();
            try {
                return delegate.listMultipartUploads(keyPrefix);
            } finally {
                exited();
            }
        }

        @Override
        public Long size(String key) throws IOException {
            entered();
            try {
                return delegate.size(key);
            } finally {
                exited();
            }
        }

        @Override
        public InputStream open(String key) throws IOException {
            entered();
            InputStream remote;
            try {
                remote = delegate.open(key);
            } finally {
                exited();
            }
            return new FilterInputStream(remote) {
                @Override
                public int read() throws IOException {
                    int value = super.read();
                    if (value >= 0) {
                        readBytes++;
                    }
                    return value;
                }

                @Override
                public int read(byte[] body, int offset, int length) throws IOException {
                    int count = super.read(body, offset, length);
                    if (count > 0) {
                        readBytes += count;
                    }
                    return count;
                }
            };
        }

        @Override
        public void delete(String key) throws IOException {
            entered();
            try {
                delegate.delete(key);
            } finally {
                exited();
            }
        }
    }
}
