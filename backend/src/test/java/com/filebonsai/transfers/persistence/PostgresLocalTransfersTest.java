package com.filebonsai.transfers.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.filebonsai.catalog.application.CatalogCursor;
import com.filebonsai.catalog.application.CatalogFailure;
import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import com.filebonsai.catalog.persistence.PostgresCatalog;
import com.filebonsai.storage.LocalObjectStorage;
import com.filebonsai.transfers.application.UploadFailure;
import com.filebonsai.transfers.domain.UploadState;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
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
class PostgresLocalTransfersTest {
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
    private LocalObjectStorage storage;
    private PostgresLocalTransfers transfers;

    @BeforeAll
    static void migrate() {
        var hikari = new HikariConfig();
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
        database.execute("truncate table upload_sessions, idempotency_records, catalog_names, file_versions, "
                + "physical_objects, catalog_entries, workspace_members, workspaces cascade");
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
        storage = new LocalObjectStorage(temporaryDirectory.resolve("objects"), 1024);
        transfers = new PostgresLocalTransfers(database, storage, Duration.ofHours(24));
    }

    @Test
    void persistsIntentStreamsPublishesAndDownloadsAnImmutableOriginal() throws Exception {
        byte[] content = "durable bytes".getBytes(StandardCharsets.UTF_8);
        byte[] digest = sha256(content);
        UUID key = UUID.randomUUID();
        var begun = transfers.begin(scope, ROOT, new FileName("notes.txt"), new ByteCount(content.length), digest, key);

        assertThat(transfers.begin(scope, ROOT, new FileName("notes.txt"), new ByteCount(content.length), digest, key))
                .isEqualTo(begun);
        assertThat(database.fetchValue("select claim_kind from catalog_names where id = ?", begun.id()))
                .isEqualTo("reservation");

        var staged = transfers.receive(scope, begun.id(), new ByteArrayInputStream(content));
        assertThat(staged.state()).isEqualTo(UploadState.STAGED);
        assertThat(staged.computedSha256()).isEqualTo(LocalObjectStorage.hex(digest));
        var available = transfers.complete(scope, begun.id());
        assertThat(available.state()).isEqualTo(UploadState.AVAILABLE);
        assertThat(transfers.complete(scope, begun.id())).isEqualTo(available);
        assertThat(database.fetchValue(
                        "select current_version_id from catalog_entries where id = ?",
                        begun.entryId().value()))
                .isEqualTo(begun.versionId().value());
        assertThat(database.fetchValue("select claim_kind from catalog_names where id = ?", begun.id()))
                .isEqualTo("entry");

        try (var download = transfers.open(scope, begun.entryId())) {
            assertThat(download.name().value()).isEqualTo("notes.txt");
            assertThat(download.content().readAllBytes()).isEqualTo(content);
        }
    }

    @Test
    void rejectsMismatchedBodiesThenAcceptsAWholeBodyRetry() throws Exception {
        byte[] content = "right".getBytes(StandardCharsets.UTF_8);
        var upload = transfers.begin(
                scope,
                ROOT,
                new FileName("retry.bin"),
                new ByteCount(content.length),
                sha256(content),
                UUID.randomUUID());

        assertThatThrownBy(() -> transfers.receive(
                        scope, upload.id(), new ByteArrayInputStream("wrong".getBytes(StandardCharsets.UTF_8))))
                .isInstanceOfSatisfying(
                        UploadFailure.class,
                        failure -> assertThat(failure.reason()).isEqualTo(UploadFailure.Reason.DIGEST_MISMATCH));
        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.INITIATED);
        assertThat(transfers
                        .receive(scope, upload.id(), new ByteArrayInputStream(content))
                        .state())
                .isEqualTo(UploadState.STAGED);
    }

    @Test
    void cancellationIsIdempotentAndReleasesTheReservedName() {
        var upload =
                transfers.begin(scope, ROOT, new FileName("cancelled.bin"), new ByteCount(0), null, UUID.randomUUID());
        assertThat(transfers.cancel(scope, upload.id()).state()).isEqualTo(UploadState.CANCELLED);
        assertThat(transfers.cancel(scope, upload.id()).state()).isEqualTo(UploadState.CANCELLED);

        var replacement =
                transfers.begin(scope, ROOT, new FileName("cancelled.bin"), new ByteCount(0), null, UUID.randomUUID());
        assertThat(replacement.id()).isNotEqualTo(upload.id());
    }

    @Test
    void reconciliationPublishesVerifiedFinalBytesAfterRestart() throws Exception {
        byte[] content = "reconcile".getBytes(StandardCharsets.UTF_8);
        var upload = transfers.begin(
                scope, ROOT, new FileName("reconcile.bin"), new ByteCount(content.length), null, UUID.randomUUID());
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(content));
        var row = database.fetchOne(
                "select accepted_temp_key, storage_key from upload_sessions where id = ?", upload.id());
        storage.promote(row.get("accepted_temp_key", String.class), row.get("storage_key", String.class));
        database.execute(
                "update upload_sessions set state = 'RECONCILING', updated_at = current_timestamp where id = ?",
                upload.id());

        new PostgresLocalTransfers(database, storage, Duration.ofHours(24)).reconcile();

        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.AVAILABLE);
        try (var download = transfers.open(scope, upload.entryId())) {
            assertThat(download.content().readAllBytes()).isEqualTo(content);
        }
    }

    @Test
    void restartFencesAnInterruptedReceiverBackToAWholeBodyRetry() throws Exception {
        var upload = transfers.begin(
                scope, ROOT, new FileName("interrupted.bin"), new ByteCount(1), null, UUID.randomUUID());
        UUID attempt = UUID.randomUUID();
        UUID objectId = database.fetchOne("select object_id from upload_sessions where id = ?", upload.id())
                .get("object_id", UUID.class);
        var partial = storage.writeAttempt(WORKSPACE, objectId, attempt, new ByteArrayInputStream(new byte[] {1}), 1);
        database.execute(
                "update upload_sessions set state = 'RECEIVING', active_attempt_id = ?, fence = 1, "
                        + "updated_at = current_timestamp where id = ?",
                attempt,
                upload.id());

        new PostgresLocalTransfers(database, storage, Duration.ofHours(24)).reconcile();

        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.INITIATED);
        assertThat(storage.verifies(partial.key(), 1, partial.sha256())).isFalse();
    }

    @Test
    void uploadAndDownloadLookupsDoNotRevealOtherWorkspaces() throws Exception {
        var upload =
                transfers.begin(scope, ROOT, new FileName("private.bin"), new ByteCount(0), null, UUID.randomUUID());
        CatalogScope outsider = new CatalogScope(UUID.randomUUID(), WORKSPACE);
        assertThatThrownBy(() -> transfers.get(outsider, upload.id()))
                .isInstanceOfSatisfying(
                        UploadFailure.class,
                        failure -> assertThat(failure.reason()).isEqualTo(UploadFailure.Reason.UPLOAD_NOT_FOUND));
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(new byte[0]));
        transfers.complete(scope, upload.id());
        assertThatThrownBy(() -> transfers.open(outsider, upload.entryId()))
                .isInstanceOfSatisfying(
                        UploadFailure.class,
                        failure -> assertThat(failure.reason()).isEqualTo(UploadFailure.Reason.ENTRY_NOT_FOUND));
    }

    @Test
    void anotherWorkspaceMemberCannotObserveOrMutateTheCreatorsUpload() {
        UUID otherPrincipal = UUID.randomUUID();
        database.execute(
                "insert into workspace_members (workspace_id, principal_id, role, created_at) "
                        + "values (?, ?, 'member', current_timestamp)",
                WORKSPACE,
                otherPrincipal);
        CatalogScope otherMember = new CatalogScope(otherPrincipal, WORKSPACE);
        var upload = transfers.begin(scope, ROOT, new FileName("owned.bin"), new ByteCount(0), null, UUID.randomUUID());

        assertThatThrownBy(() -> transfers.get(otherMember, upload.id()))
                .isInstanceOfSatisfying(
                        UploadFailure.class,
                        failure -> assertThat(failure.reason()).isEqualTo(UploadFailure.Reason.UPLOAD_NOT_FOUND));
        assertThatThrownBy(() -> transfers.receive(otherMember, upload.id(), new ByteArrayInputStream(new byte[0])))
                .isInstanceOfSatisfying(
                        UploadFailure.class,
                        failure -> assertThat(failure.reason()).isEqualTo(UploadFailure.Reason.UPLOAD_NOT_FOUND));
        assertThatThrownBy(() -> transfers.cancel(otherMember, upload.id()))
                .isInstanceOfSatisfying(
                        UploadFailure.class,
                        failure -> assertThat(failure.reason()).isEqualTo(UploadFailure.Reason.UPLOAD_NOT_FOUND));
    }

    @Test
    void expiryIsEnforcedAtCompletionAndReleasesTheReservation() throws Exception {
        byte[] content = new byte[] {1};
        var upload =
                transfers.begin(scope, ROOT, new FileName("expired.bin"), new ByteCount(1), null, UUID.randomUUID());
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(content));
        database.execute(
                "update upload_sessions set created_at = current_timestamp - interval '2 days', "
                        + "expires_at = current_timestamp - interval '1 second' where id = ?",
                upload.id());

        assertThatThrownBy(() -> transfers.complete(scope, upload.id()))
                .isInstanceOfSatisfying(
                        UploadFailure.class,
                        failure -> assertThat(failure.reason()).isEqualTo(UploadFailure.Reason.EXPIRED));
        assertThat(database.fetchValue("select state from upload_sessions where id = ?", upload.id()))
                .isEqualTo("EXPIRED");
        assertThat(database.fetchOne("select count(*) from catalog_names where id = ?", upload.id())
                        .get(0, Integer.class))
                .isZero();
    }

    @Test
    void availableDownloadSurvivesRemovalOfTheUploaderMembership() throws Exception {
        byte[] content = "workspace-owned".getBytes(StandardCharsets.UTF_8);
        var upload = transfers.begin(
                scope,
                ROOT,
                new FileName("workspace.bin"),
                new ByteCount(content.length),
                sha256(content),
                UUID.randomUUID());
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(content));
        transfers.complete(scope, upload.id());
        UUID otherPrincipal = UUID.randomUUID();
        database.execute(
                "insert into workspace_members (workspace_id, principal_id, role, created_at) "
                        + "values (?, ?, 'owner', current_timestamp)",
                WORKSPACE,
                otherPrincipal);
        database.execute(
                "delete from workspace_members where workspace_id = ? and principal_id = ?", WORKSPACE, PRINCIPAL);

        try (var download = transfers.open(new CatalogScope(otherPrincipal, WORKSPACE), upload.entryId())) {
            assertThat(download.content().readAllBytes()).isEqualTo(content);
        }
    }

    @Test
    void rejectsShortAndLongBodiesAndPublishesAZeroByteOriginal() throws Exception {
        var upload =
                transfers.begin(scope, ROOT, new FileName("length.bin"), new ByteCount(1), null, UUID.randomUUID());
        for (byte[] body : new byte[][] {new byte[0], new byte[] {1, 2}}) {
            assertThatThrownBy(() -> transfers.receive(scope, upload.id(), new ByteArrayInputStream(body)))
                    .isInstanceOfSatisfying(
                            UploadFailure.class,
                            failure -> assertThat(failure.reason()).isEqualTo(UploadFailure.Reason.SIZE_MISMATCH));
            assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.INITIATED);
        }
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(new byte[] {1}));
        assertThat(transfers.complete(scope, upload.id()).state()).isEqualTo(UploadState.AVAILABLE);
        var empty = transfers.begin(
                scope, ROOT, new FileName("empty.bin"), new ByteCount(0), sha256(new byte[0]), UUID.randomUUID());
        transfers.receive(scope, empty.id(), new ByteArrayInputStream(new byte[0]));
        transfers.complete(scope, empty.id());
        try (var download = transfers.open(scope, empty.entryId())) {
            assertThat(download.content().readAllBytes()).isEmpty();
        }
        assertThatThrownBy(() -> transfers.begin(
                        scope, ROOT, new FileName("large.bin"), new ByteCount(1025), null, UUID.randomUUID()))
                .isInstanceOfSatisfying(
                        UploadFailure.class,
                        failure -> assertThat(failure.reason()).isEqualTo(UploadFailure.Reason.TOO_LARGE));
    }

    @Test
    void restartRestagesAcceptedBytesBeforePromotionAndCompletionRemainsIdempotent() throws Exception {
        byte[] content = new byte[] {4, 2};
        var upload = transfers.begin(
                scope, ROOT, new FileName("staged.bin"), new ByteCount(2), sha256(content), UUID.randomUUID());
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(content));
        database.execute("update upload_sessions set state = 'FINALIZING' where id = ?", upload.id());
        var restarted = new PostgresLocalTransfers(database, storage, Duration.ofHours(24));
        restarted.reconcile();
        assertThat(restarted.get(scope, upload.id()).state()).isEqualTo(UploadState.STAGED);
        var completed = restarted.complete(scope, upload.id());
        restarted.reconcile();
        assertThat(restarted.complete(scope, upload.id())).isEqualTo(completed);
        assertThat(database.fetchOne(
                                "select count(*) from file_versions where entry_id = ?",
                                upload.entryId().value())
                        .get(0, Integer.class))
                .isEqualTo(1);
    }

    @Test
    void activeReceiverRejectsCollisionAndCancellationFencesItsPublication() throws Exception {
        var upload =
                transfers.begin(scope, ROOT, new FileName("racing.bin"), new ByteCount(1), null, UUID.randomUUID());
        var source = new ByteArrayInputStream(new byte[] {1}) {
            private boolean checked;

            @Override
            public synchronized int read(byte[] buffer, int offset, int length) {
                if (!checked) {
                    checked = true;
                    assertThatThrownBy(() ->
                                    transfers.receive(scope, upload.id(), new ByteArrayInputStream(new byte[] {2})))
                            .isInstanceOfSatisfying(
                                    UploadFailure.class,
                                    failure ->
                                            assertThat(failure.reason()).isEqualTo(UploadFailure.Reason.INVALID_STATE));
                    assertThat(transfers.cancel(scope, upload.id()).state()).isEqualTo(UploadState.CANCELLED);
                }
                return super.read(buffer, offset, length);
            }
        };
        assertThatThrownBy(() -> transfers.receive(scope, upload.id(), source))
                .isInstanceOfSatisfying(
                        UploadFailure.class,
                        failure -> assertThat(failure.reason()).isEqualTo(UploadFailure.Reason.INVALID_STATE));
        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.CANCELLED);
        assertThat(database.fetchOne(
                                "select count(*) from file_versions where entry_id = ?",
                                upload.entryId().value())
                        .get(0, Integer.class))
                .isZero();
    }

    @Test
    void uncertainPublicationKeepsItsNamePastExpiryAndRecoversAfterCommitFailure() throws Exception {
        byte[] content = new byte[] {8, 9};
        FileName name = new FileName("recoverable.bin");
        var upload = transfers.begin(scope, ROOT, name, new ByteCount(2), sha256(content), UUID.randomUUID());
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(content));
        database.execute("create function fail_test_publication() returns trigger language plpgsql as $$ "
                + "begin raise exception 'injected publication failure'; end $$");
        database.execute("create trigger fail_test_publication before insert on physical_objects "
                + "for each row execute function fail_test_publication()");
        try {
            assertThatThrownBy(() -> transfers.complete(scope, upload.id()))
                    .isInstanceOfSatisfying(
                            UploadFailure.class,
                            failure ->
                                    assertThat(failure.reason()).isEqualTo(UploadFailure.Reason.STORAGE_UNAVAILABLE));
        } finally {
            database.execute("drop trigger fail_test_publication on physical_objects");
            database.execute("drop function fail_test_publication()");
        }
        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.RECONCILING);
        database.execute(
                "update upload_sessions set created_at = current_timestamp - interval '2 days', "
                        + "expires_at = current_timestamp - interval '1 second' where id = ?",
                upload.id());
        assertThatThrownBy(() -> transfers.begin(scope, ROOT, name, new ByteCount(2), null, UUID.randomUUID()))
                .isInstanceOfSatisfying(
                        UploadFailure.class,
                        failure -> assertThat(failure.reason()).isEqualTo(UploadFailure.Reason.NAME_CONFLICT));
        var catalog = new PostgresCatalog(database, new CatalogCursor(new ObjectMapper(), new byte[32]));
        assertThatThrownBy(() -> catalog.create(scope, ROOT, name, UUID.randomUUID()))
                .isInstanceOfSatisfying(
                        CatalogFailure.class,
                        failure -> assertThat(failure.reason()).isEqualTo(CatalogFailure.Reason.NAME_CONFLICT));
        var restarted = new PostgresLocalTransfers(database, storage, Duration.ofHours(24));
        restarted.reconcile();
        assertThat(restarted.get(scope, upload.id()).state()).isEqualTo(UploadState.AVAILABLE);
        try (var download = restarted.open(scope, upload.entryId())) {
            assertThat(download.content().readAllBytes()).isEqualTo(content);
        }
    }

    @Test
    void recoveredStagedUploadReleasesItsPinnedNameWhenExpired() throws Exception {
        FileName name = new FileName("restaged.bin");
        var upload = transfers.begin(scope, ROOT, name, new ByteCount(1), null, UUID.randomUUID());
        transfers.receive(scope, upload.id(), new ByteArrayInputStream(new byte[] {1}));
        // An existing conflicting destination makes promotion fail after preparation pins the name.
        String key = database.fetchOne("select storage_key from upload_sessions where id = ?", upload.id())
                .get("storage_key", String.class);
        Path destination = temporaryDirectory.resolve("objects").resolve(key);
        java.nio.file.Files.createDirectories(destination.getParent());
        java.nio.file.Files.write(destination, new byte[] {2});
        assertThatThrownBy(() -> transfers.complete(scope, upload.id())).isInstanceOf(UploadFailure.class);
        java.nio.file.Files.delete(destination);
        transfers.reconcile();
        assertThat(transfers.get(scope, upload.id()).state()).isEqualTo(UploadState.STAGED);
        database.execute(
                "update upload_sessions set created_at = current_timestamp - interval '2 days', "
                        + "expires_at = current_timestamp - interval '1 second' where id = ?",
                upload.id());
        var replacement = transfers.begin(scope, ROOT, name, new ByteCount(0), null, UUID.randomUUID());
        assertThat(replacement.id()).isNotEqualTo(upload.id());
        assertThat(database.fetchValue("select state from upload_sessions where id = ?", upload.id()))
                .isEqualTo("EXPIRED");
    }

    private byte[] sha256(byte[] content) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(content);
    }
}
