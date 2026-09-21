package com.filebonsai.transfers.persistence;

import static com.filebonsai.transfers.application.UploadFailure.Reason.DIGEST_MISMATCH;
import static com.filebonsai.transfers.application.UploadFailure.Reason.ENTRY_NOT_FOUND;
import static com.filebonsai.transfers.application.UploadFailure.Reason.EXPIRED;
import static com.filebonsai.transfers.application.UploadFailure.Reason.IDEMPOTENCY_CONFLICT;
import static com.filebonsai.transfers.application.UploadFailure.Reason.INVALID_STATE;
import static com.filebonsai.transfers.application.UploadFailure.Reason.NAME_CONFLICT;
import static com.filebonsai.transfers.application.UploadFailure.Reason.SIZE_MISMATCH;
import static com.filebonsai.transfers.application.UploadFailure.Reason.STORAGE_UNAVAILABLE;
import static com.filebonsai.transfers.application.UploadFailure.Reason.TOO_LARGE;
import static com.filebonsai.transfers.application.UploadFailure.Reason.UPLOAD_NOT_FOUND;

import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import com.filebonsai.catalog.domain.VersionId;
import com.filebonsai.storage.LocalObjectStorage;
import com.filebonsai.transfers.application.BeginUpload;
import com.filebonsai.transfers.application.CancelUpload;
import com.filebonsai.transfers.application.CompleteUpload;
import com.filebonsai.transfers.application.DownloadOriginal;
import com.filebonsai.transfers.application.GetUpload;
import com.filebonsai.transfers.application.ReceiveUpload;
import com.filebonsai.transfers.application.UploadFailure;
import com.filebonsai.transfers.application.UploadSession;
import com.filebonsai.transfers.domain.UploadState;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.jooq.exception.DataAccessException;
import org.jooq.impl.DSL;

public final class PostgresLocalTransfers
        implements BeginUpload, GetUpload, ReceiveUpload, CompleteUpload, CancelUpload, DownloadOriginal {
    private static final String SESSION_COLUMNS = "u.id, u.workspace_id, u.principal_id, u.parent_id, u.name, "
            + "u.entry_id, u.version_id, u.object_id, u.expected_size_bytes, u.expected_sha256, "
            + "u.computed_sha256, u.state, u.fence, u.active_attempt_id, u.recovery_claim_id, "
            + "u.accepted_temp_key, u.storage_key, u.expires_at";

    private final DSLContext database;
    private final LocalObjectStorage storage;
    private final Duration expiry;

    public PostgresLocalTransfers(DSLContext database, LocalObjectStorage storage, Duration expiry) {
        this.database = database;
        this.storage = storage;
        this.expiry = expiry;
    }

    @Override
    public UploadSession begin(
            CatalogScope scope,
            EntryId parentId,
            FileName name,
            ByteCount expectedSize,
            byte[] expectedSha256,
            UUID idempotencyKey) {
        if (expectedSize.value() > storage.maximumBytes()) {
            throw new UploadFailure(TOO_LARGE, "Upload exceeds the configured size limit");
        }
        byte[] intent = intent(parentId, name, expectedSize, expectedSha256);
        try {
            return database.transactionResult(configuration -> {
                DSLContext transaction = DSL.using(configuration);
                transaction.execute(
                        "select pg_advisory_xact_lock(hashtextextended(?, 0))",
                        scope.workspaceId() + ":" + scope.principalId() + ":begin-upload:" + idempotencyKey);
                Record replay = transaction.fetchOne(
                        "select " + SESSION_COLUMNS + ", u.intent_hash from upload_sessions u "
                                + "where u.workspace_id = ? and u.principal_id = ? and u.idempotency_key = ?",
                        scope.workspaceId(),
                        scope.principalId(),
                        idempotencyKey);
                if (replay != null) {
                    if (!MessageDigest.isEqual(intent, replay.get("intent_hash", byte[].class))) {
                        throw new UploadFailure(
                                IDEMPOTENCY_CONFLICT, "Idempotency key was already used for different input");
                    }
                    return map(replay);
                }
                if (transaction.fetchExists(
                                DSL.table(DSL.name("catalog_entries")),
                                DSL.field(DSL.name("id"), UUID.class)
                                        .eq(parentId.value())
                                        .and(DSL.field(DSL.name("workspace_id"), UUID.class)
                                                .eq(scope.workspaceId()))
                                        .and(DSL.field(DSL.name("kind"), String.class)
                                                .eq("folder")))
                        && member(transaction, scope)) {
                    expireOldReservations(transaction, scope, parentId, name);
                } else {
                    throw new UploadFailure(ENTRY_NOT_FOUND, "Containing folder was not found");
                }
                UUID uploadId = UUID.randomUUID();
                UUID entryId = UUID.randomUUID();
                UUID versionId = UUID.randomUUID();
                UUID objectId = UUID.randomUUID();
                String storageKey = storage.finalKey(scope.workspaceId(), objectId);
                transaction.execute(
                        "insert into upload_sessions (id, workspace_id, principal_id, parent_id, name, entry_id, "
                                + "version_id, object_id, idempotency_key, intent_hash, expected_size_bytes, "
                                + "expected_sha256, state, storage_key, created_at, updated_at, expires_at) "
                                + "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INITIATED', ?, current_timestamp, "
                                + "current_timestamp, current_timestamp + (? * interval '1 millisecond'))",
                        uploadId,
                        scope.workspaceId(),
                        scope.principalId(),
                        parentId.value(),
                        name.value(),
                        entryId,
                        versionId,
                        objectId,
                        idempotencyKey,
                        intent,
                        expectedSize.value(),
                        expectedSha256,
                        storageKey,
                        expiry.toMillis());
                transaction.execute(
                        "insert into catalog_names (id, workspace_id, parent_id, name, claim_kind, entry_id, "
                                + "expires_at, created_at) values (?, ?, ?, ?, 'reservation', null, "
                                + "(select expires_at from upload_sessions where id = ?), current_timestamp)",
                        uploadId,
                        scope.workspaceId(),
                        parentId.value(),
                        name.value(),
                        uploadId);
                return map(find(transaction, scope, uploadId, false));
            });
        } catch (DataAccessException exception) {
            if ("23505".equals(exception.sqlState())) {
                throw new UploadFailure(NAME_CONFLICT, "A sibling entry or pending upload already reserves this name");
            }
            throw exception;
        }
    }

    @Override
    public UploadSession get(CatalogScope scope, UUID uploadId) {
        Record row = database.transactionResult(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            Record found = find(transaction, scope, uploadId, true);
            if (expirable(found) && expired(transaction, found)) {
                expire(transaction, found);
                return find(transaction, scope, uploadId, false);
            }
            return found;
        });
        if (state(row) == UploadState.EXPIRED) {
            deleteQuietly(row.get("accepted_temp_key", String.class));
            throw new UploadFailure(EXPIRED, "Upload session has expired");
        }
        return map(row);
    }

    @Override
    public UploadSession receive(CatalogScope scope, UUID uploadId, InputStream content) {
        ReceivingLease lease =
                database.transactionResult(configuration -> acquire(DSL.using(configuration), scope, uploadId));
        if (lease == null) {
            throw new UploadFailure(EXPIRED, "Upload session has expired");
        }
        LocalObjectStorage.StoredBody body;
        try {
            body = storage.writeAttempt(
                    lease.workspaceId(), lease.objectId(), lease.attemptId(), content, lease.expectedSize());
        } catch (LocalObjectStorage.BodyTooLargeException exception) {
            resetAfterRejectedAttempt(lease);
            throw new UploadFailure(SIZE_MISMATCH, "Content length does not match the upload intent");
        } catch (IOException exception) {
            resetAfterStorageFailure(lease);
            throw new UploadFailure(STORAGE_UNAVAILABLE, "Local storage could not accept content", exception);
        }
        if (body.size() != lease.expectedSize()) {
            rejectBody(lease, body.key());
            throw new UploadFailure(SIZE_MISMATCH, "Content length does not match the upload intent");
        }
        if (lease.expectedSha256() != null && !MessageDigest.isEqual(lease.expectedSha256(), body.sha256())) {
            rejectBody(lease, body.key());
            throw new UploadFailure(DIGEST_MISMATCH, "Content SHA-256 does not match the upload intent");
        }
        int changed = database.execute(
                "update upload_sessions set state = 'STAGED', active_attempt_id = null, accepted_temp_key = ?, "
                        + "computed_sha256 = ?, updated_at = current_timestamp where id = ? and workspace_id = ? "
                        + "and principal_id = ? and state = 'RECEIVING' and active_attempt_id = ? and fence = ?",
                body.key(),
                body.sha256(),
                uploadId,
                scope.workspaceId(),
                scope.principalId(),
                lease.attemptId(),
                lease.fence());
        if (changed != 1) {
            deleteQuietly(body.key());
            throw new UploadFailure(INVALID_STATE, "A newer upload attempt superseded this writer");
        }
        if (lease.previousTempKey() != null && !lease.previousTempKey().equals(body.key())) {
            deleteQuietly(lease.previousTempKey());
        }
        return get(scope, uploadId);
    }

    @Override
    public UploadSession complete(CatalogScope scope, UUID uploadId) {
        CompletionLease completion = database.transactionResult(
                configuration -> prepareCompletion(DSL.using(configuration), scope, uploadId));
        if (completion == null) {
            throw new UploadFailure(EXPIRED, "Upload session has expired");
        }
        Record prepared = completion.row();
        UploadSession session = map(prepared);
        if (session.state() == UploadState.AVAILABLE) {
            return session;
        }
        String temporaryKey = prepared.get("accepted_temp_key", String.class);
        String finalKey = prepared.get("storage_key", String.class);
        byte[] digest = prepared.get("computed_sha256", byte[].class);
        long size = prepared.get("expected_size_bytes", Long.class);
        try {
            if (!storage.verifies(finalKey, size, digest)) {
                storage.promote(temporaryKey, finalKey);
            }
            if (!storage.verifies(finalKey, size, digest)) {
                throw new IOException("Promoted object failed verification");
            }
            publish(scope, uploadId, completion.claimId());
            return get(scope, uploadId);
        } catch (IOException | DataAccessException exception) {
            markReconciling(scope, uploadId, completion.claimId());
            throw new UploadFailure(STORAGE_UNAVAILABLE, "Upload completion requires reconciliation", exception);
        }
    }

    @Override
    public UploadSession cancel(CatalogScope scope, UUID uploadId) {
        Cancellation cancellation = database.transactionResult(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            Record row = find(transaction, scope, uploadId, true);
            UploadState state = state(row);
            if (state == UploadState.CANCELLED) {
                return new Cancellation(row, null, false);
            }
            if (state == UploadState.EXPIRED || (expirable(row) && expired(transaction, row))) {
                expire(transaction, row);
                return new Cancellation(find(transaction, scope, uploadId, false), null, true);
            }
            if (state != UploadState.INITIATED && state != UploadState.RECEIVING && state != UploadState.STAGED) {
                throw new UploadFailure(INVALID_STATE, "Upload cannot be cancelled after finalization starts");
            }
            transaction.execute(
                    "update upload_sessions set state = 'CANCELLED', active_attempt_id = null, fence = fence + 1, "
                            + "updated_at = current_timestamp where id = ?",
                    uploadId);
            transaction.execute(
                    "delete from catalog_names where id = ? and workspace_id = ? and claim_kind = 'reservation'",
                    uploadId,
                    scope.workspaceId());
            Record updated = find(transaction, scope, uploadId, false);
            return new Cancellation(updated, row.get("accepted_temp_key", String.class), false);
        });
        deleteQuietly(cancellation.temporaryKey());
        if (cancellation.expired()) {
            throw new UploadFailure(EXPIRED, "Upload session has expired");
        }
        return map(cancellation.row());
    }

    @Override
    public Download open(CatalogScope scope, EntryId entryId) {
        Record row = database.fetchOne(
                "select n.name, o.size_bytes, o.sha256, o.storage_key from catalog_entries e "
                        + "join catalog_names n on n.workspace_id = e.workspace_id and n.entry_id = e.id "
                        + "and n.claim_kind = 'entry' "
                        + "join file_versions v on v.workspace_id = e.workspace_id and v.id = e.current_version_id "
                        + "join physical_objects o on o.workspace_id = v.workspace_id and o.id = v.object_id "
                        + "where e.workspace_id = ? and e.id = ? and e.kind = 'file' and exists "
                        + "(select 1 from workspace_members m where m.workspace_id = e.workspace_id "
                        + "and m.principal_id = ?)",
                scope.workspaceId(),
                entryId.value(),
                scope.principalId());
        if (row == null) {
            throw new UploadFailure(ENTRY_NOT_FOUND, "Entry was not found");
        }
        try {
            if (!storage.verifies(
                    row.get("storage_key", String.class),
                    row.get("size_bytes", Long.class),
                    row.get("sha256", byte[].class))) {
                throw new IOException("Stored object failed verification");
            }
            return new Download(
                    new FileName(row.get("name", String.class)),
                    new ByteCount(row.get("size_bytes", Long.class)),
                    storage.open(row.get("storage_key", String.class)));
        } catch (IOException exception) {
            throw new UploadFailure(STORAGE_UNAVAILABLE, "Stored content is temporarily unavailable", exception);
        }
    }

    public void reconcile() {
        List<UUID> receiving = database.fetch("select id from upload_sessions where state = 'RECEIVING' order by id")
                .getValues("id", UUID.class);
        for (UUID uploadId : receiving) {
            recoverReceiving(uploadId);
        }
        List<UUID> sessions = database.fetch(
                        "select id from upload_sessions where state in ('FINALIZING', 'RECONCILING') order by id")
                .getValues("id", UUID.class);
        for (UUID uploadId : sessions) {
            reconcile(uploadId);
        }
        expireAbandoned();
    }

    private void recoverReceiving(UUID uploadId) {
        UUID claimId = UUID.randomUUID();
        Record row = database.transactionResult(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            Record candidate = findInternal(transaction, uploadId, true);
            if (candidate == null || state(candidate) != UploadState.RECEIVING) {
                return null;
            }
            transaction.execute(
                    "update upload_sessions set recovery_claim_id = ?, fence = fence + 1, "
                            + "updated_at = current_timestamp where id = ?",
                    claimId,
                    uploadId);
            return findInternal(transaction, uploadId, false);
        });
        if (row == null) {
            return;
        }
        UUID workspaceId = row.get("workspace_id", UUID.class);
        UUID objectId = row.get("object_id", UUID.class);
        UUID attemptId = row.get("active_attempt_id", UUID.class);
        String accepted = row.get("accepted_temp_key", String.class);
        byte[] digest = row.get("computed_sha256", byte[].class);
        boolean staged = false;
        try {
            staged = accepted != null
                    && digest != null
                    && storage.verifies(accepted, row.get("expected_size_bytes", Long.class), digest);
        } catch (IOException ignored) {
            // The durable session remains retryable; a later request can supply the whole body again.
        }
        int changed = database.execute(
                "update upload_sessions set state = ?, active_attempt_id = null, accepted_temp_key = ?, "
                        + "computed_sha256 = ?, recovery_claim_id = null, updated_at = current_timestamp "
                        + "where id = ? and state = 'RECEIVING' and recovery_claim_id = ?",
                staged ? "STAGED" : "INITIATED",
                staged ? accepted : null,
                staged ? digest : null,
                uploadId,
                claimId);
        if (changed == 1) {
            deleteQuietly(storage.attemptKey(workspaceId, objectId, attemptId));
            if (!staged) {
                deleteQuietly(accepted);
            }
        }
    }

    private void reconcile(UUID uploadId) {
        UUID claimId = UUID.randomUUID();
        Record row = database.transactionResult(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            Record candidate = findInternal(transaction, uploadId, true);
            if (candidate == null
                    || (state(candidate) != UploadState.FINALIZING && state(candidate) != UploadState.RECONCILING)) {
                return null;
            }
            transaction.execute(
                    "update upload_sessions set state = 'RECONCILING', recovery_claim_id = ?, fence = fence + 1, "
                            + "updated_at = current_timestamp where id = ?",
                    claimId,
                    uploadId);
            return findInternal(transaction, uploadId, false);
        });
        if (row == null) {
            return;
        }
        long size = row.get("expected_size_bytes", Long.class);
        byte[] digest = row.get("computed_sha256", byte[].class);
        String finalKey = row.get("storage_key", String.class);
        String temporaryKey = row.get("accepted_temp_key", String.class);
        try {
            if (storage.verifies(finalKey, size, digest)) {
                publish(uploadId, claimId);
            } else if (temporaryKey != null && storage.verifies(temporaryKey, size, digest)) {
                database.execute(
                        "update upload_sessions set state = 'STAGED', recovery_claim_id = null, "
                                + "updated_at = current_timestamp where id = ? and state = 'RECONCILING' "
                                + "and recovery_claim_id = ?",
                        uploadId,
                        claimId);
            } else {
                failUnrecoverable(uploadId, claimId);
            }
        } catch (RuntimeException | IOException exception) {
            markReconciling(uploadId, claimId);
        }
    }

    private CompletionLease prepareCompletion(DSLContext transaction, CatalogScope scope, UUID uploadId) {
        Record row = find(transaction, scope, uploadId, true);
        UploadState state = state(row);
        if (state == UploadState.AVAILABLE) {
            return new CompletionLease(row, null);
        }
        if (state == UploadState.EXPIRED || (expirable(row) && expired(transaction, row))) {
            expire(transaction, row);
            return null;
        }
        if (state == UploadState.RECONCILING || state == UploadState.FINALIZING) {
            throw new UploadFailure(STORAGE_UNAVAILABLE, "Upload completion is already in progress");
        }
        if (state != UploadState.STAGED) {
            throw new UploadFailure(INVALID_STATE, "Upload content must be staged before completion");
        }
        // Finalization can outlive the upload deadline. Pin the name in the same transaction
        // before any filesystem I/O so both Catalog and upload cleanup preserve uncertain work.
        int reserved = transaction.execute(
                "update catalog_names set expires_at = 'infinity'::timestamptz "
                        + "where id = ? and claim_kind = 'reservation'",
                uploadId);
        if (reserved != 1) {
            throw new UploadFailure(INVALID_STATE, "Upload reservation is no longer available");
        }
        UUID claimId = UUID.randomUUID();
        transaction.execute(
                "update upload_sessions set state = 'FINALIZING', recovery_claim_id = ?, fence = fence + 1, "
                        + "updated_at = current_timestamp where id = ?",
                claimId,
                uploadId);
        return new CompletionLease(find(transaction, scope, uploadId, false), claimId);
    }

    private void publish(CatalogScope scope, UUID uploadId, UUID claimId) {
        // Authorize the caller before switching to the internal, claim-fenced publication path.
        find(database, scope, uploadId, false);
        publish(uploadId, claimId);
    }

    private void publish(UUID uploadId, UUID claimId) {
        database.transaction(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            Record row = findInternal(transaction, uploadId, true);
            if (state(row) == UploadState.AVAILABLE) {
                return;
            }
            if (state(row) != UploadState.FINALIZING && state(row) != UploadState.RECONCILING) {
                throw new UploadFailure(INVALID_STATE, "Upload is not ready for publication");
            }
            if (!claimId.equals(row.get("recovery_claim_id", UUID.class))) {
                throw new UploadFailure(INVALID_STATE, "Upload completion was superseded");
            }
            UUID entryId = row.get("entry_id", UUID.class);
            UUID versionId = row.get("version_id", UUID.class);
            UUID objectId = row.get("object_id", UUID.class);
            UUID workspaceId = row.get("workspace_id", UUID.class);
            long size = row.get("expected_size_bytes", Long.class);
            transaction.execute(
                    "insert into physical_objects (id, workspace_id, storage_key, size_bytes, sha256, created_at) "
                            + "values (?, ?, ?, ?, ?, current_timestamp) on conflict (id) do nothing",
                    objectId,
                    workspaceId,
                    row.get("storage_key", String.class),
                    size,
                    row.get("computed_sha256", byte[].class));
            transaction.execute(
                    "insert into catalog_entries (id, workspace_id, kind, created_at, updated_at, current_version_id) "
                            + "values (?, ?, 'file', current_timestamp, current_timestamp, ?) "
                            + "on conflict (id) do nothing",
                    entryId,
                    workspaceId,
                    versionId);
            transaction.execute(
                    "insert into file_versions (id, workspace_id, entry_id, object_id, ordinal, size_bytes, created_at) "
                            + "values (?, ?, ?, ?, 1, ?, current_timestamp) on conflict (id) do nothing",
                    versionId,
                    workspaceId,
                    entryId,
                    objectId,
                    size);
            int claimed = transaction.execute(
                    "update catalog_names set claim_kind = 'entry', entry_id = ?, expires_at = null "
                            + "where id = ? and workspace_id = ? and claim_kind = 'reservation'",
                    entryId,
                    uploadId,
                    workspaceId);
            if (claimed != 1) {
                throw new IllegalStateException("Upload reservation is missing during publication");
            }
            String claim = (String) transaction.fetchValue(
                    "select claim_kind from catalog_names where id = ? and workspace_id = ?", uploadId, workspaceId);
            if (!"entry".equals(claim)) {
                throw new IllegalStateException("Upload reservation did not become a catalog entry");
            }
            transaction.execute(
                    "update upload_sessions set state = 'AVAILABLE', accepted_temp_key = null, recovery_claim_id = null, "
                            + "updated_at = current_timestamp where id = ?",
                    uploadId);
        });
    }

    private ReceivingLease acquire(DSLContext transaction, CatalogScope scope, UUID uploadId) {
        Record row = find(transaction, scope, uploadId, true);
        UploadState state = state(row);
        if (state == UploadState.EXPIRED || (expirable(row) && expired(transaction, row))) {
            expire(transaction, row);
            return null;
        }
        if (state != UploadState.INITIATED && state != UploadState.STAGED) {
            throw new UploadFailure(INVALID_STATE, "Upload is not accepting content in its current state");
        }
        UUID attemptId = UUID.randomUUID();
        long fence = ((Number) transaction.fetchValue(
                        "update upload_sessions set state = 'RECEIVING', active_attempt_id = ?, "
                                + "recovery_claim_id = null, fence = fence + 1, "
                                + "updated_at = current_timestamp where id = ? returning fence",
                        attemptId,
                        uploadId))
                .longValue();
        return new ReceivingLease(
                scope,
                uploadId,
                row.get("workspace_id", UUID.class),
                row.get("object_id", UUID.class),
                attemptId,
                fence,
                row.get("expected_size_bytes", Long.class),
                row.get("expected_sha256", byte[].class),
                row.get("accepted_temp_key", String.class));
    }

    private Record find(DSLContext context, CatalogScope scope, UUID uploadId, boolean lock) {
        String suffix = lock ? " for update" : "";
        Record row = context.fetchOne(
                "select " + SESSION_COLUMNS + " from upload_sessions u where u.id = ? and u.workspace_id = ? "
                        + "and u.principal_id = ? and exists (select 1 from workspace_members m "
                        + "where m.workspace_id = u.workspace_id and m.principal_id = u.principal_id)" + suffix,
                uploadId,
                scope.workspaceId(),
                scope.principalId());
        if (row == null) {
            throw new UploadFailure(UPLOAD_NOT_FOUND, "Upload session was not found");
        }
        return row;
    }

    private Record findInternal(DSLContext context, UUID uploadId, boolean lock) {
        String suffix = lock ? " for update" : "";
        return context.fetchOne(
                "select " + SESSION_COLUMNS + " from upload_sessions u where u.id = ?" + suffix, uploadId);
    }

    private void expireOldReservations(DSLContext transaction, CatalogScope scope, EntryId parentId, FileName name) {
        transaction.execute(
                "update upload_sessions set state = 'EXPIRED', active_attempt_id = null, fence = fence + 1, "
                        + "updated_at = current_timestamp "
                        + "where workspace_id = ? and parent_id = ? and name = ? and expires_at <= current_timestamp "
                        + "and state in ('INITIATED', 'RECEIVING', 'STAGED')",
                scope.workspaceId(),
                parentId.value(),
                name.value());
        transaction.execute(
                "delete from catalog_names n where workspace_id = ? and parent_id = ? and name = ? "
                        + "and claim_kind = 'reservation' and exists "
                        + "(select 1 from upload_sessions u where u.id = n.id and u.state = 'EXPIRED')",
                scope.workspaceId(),
                parentId.value(),
                name.value());
    }

    private void expireAbandoned() {
        database.transaction(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            transaction.execute(
                    "update upload_sessions set state = 'EXPIRED', active_attempt_id = null, fence = fence + 1, "
                            + "updated_at = current_timestamp where expires_at <= current_timestamp "
                            + "and state in ('INITIATED', 'RECEIVING', 'STAGED')");
            transaction.execute("delete from catalog_names n using upload_sessions u where n.id = u.id "
                    + "and n.claim_kind = 'reservation' and u.state = 'EXPIRED'");
        });
    }

    private void expire(DSLContext transaction, Record row) {
        UUID uploadId = row.get("id", UUID.class);
        transaction.execute(
                "update upload_sessions set state = 'EXPIRED', active_attempt_id = null, fence = fence + 1, "
                        + "updated_at = current_timestamp where id = ?",
                uploadId);
        transaction.execute("delete from catalog_names where id = ? and claim_kind = 'reservation'", uploadId);
    }

    private boolean expired(DSLContext context, Record row) {
        return Boolean.TRUE.equals(context.fetchValue(
                "select ?::timestamptz <= current_timestamp", row.get("expires_at", OffsetDateTime.class)));
    }

    private boolean expirable(Record row) {
        UploadState state = state(row);
        return state == UploadState.INITIATED || state == UploadState.RECEIVING || state == UploadState.STAGED;
    }

    private void rejectBody(ReceivingLease lease, String newTemporaryKey) {
        database.execute(
                "update upload_sessions set state = 'INITIATED', active_attempt_id = null, accepted_temp_key = null, "
                        + "computed_sha256 = null, updated_at = current_timestamp where id = ? and state = 'RECEIVING' "
                        + "and active_attempt_id = ? and fence = ?",
                lease.uploadId(),
                lease.attemptId(),
                lease.fence());
        deleteQuietly(newTemporaryKey);
        deleteQuietly(lease.previousTempKey());
    }

    private void resetAfterRejectedAttempt(ReceivingLease lease) {
        rejectBody(lease, null);
    }

    private void resetAfterStorageFailure(ReceivingLease lease) {
        database.execute(
                "update upload_sessions set state = ?, active_attempt_id = null, updated_at = current_timestamp "
                        + "where id = ? and state = 'RECEIVING' and active_attempt_id = ? and fence = ?",
                lease.previousTempKey() == null ? "INITIATED" : "STAGED",
                lease.uploadId(),
                lease.attemptId(),
                lease.fence());
    }

    private void markReconciling(CatalogScope scope, UUID uploadId, UUID claimId) {
        find(database, scope, uploadId, false);
        markReconciling(uploadId, claimId);
    }

    private void markReconciling(UUID uploadId, UUID claimId) {
        database.execute(
                "update upload_sessions set state = 'RECONCILING', active_attempt_id = null, "
                        + "recovery_claim_id = null, updated_at = current_timestamp where id = ? "
                        + "and recovery_claim_id = ? and state in ('FINALIZING', 'RECONCILING')",
                uploadId,
                claimId);
    }

    private void failUnrecoverable(UUID uploadId, UUID claimId) {
        database.transaction(configuration -> {
            DSLContext transaction = DSL.using(configuration);
            int changed = transaction.execute(
                    "update upload_sessions set state = 'FAILED', active_attempt_id = null, "
                            + "recovery_claim_id = null, updated_at = current_timestamp where id = ? "
                            + "and recovery_claim_id = ? and state in ('FINALIZING', 'RECONCILING')",
                    uploadId,
                    claimId);
            if (changed == 1) {
                transaction.execute("delete from catalog_names where id = ? and claim_kind = 'reservation'", uploadId);
            }
        });
    }

    private void deleteQuietly(String key) {
        try {
            storage.deleteIfExists(key);
        } catch (IOException ignored) {
            // Cleanup is retried by recovery; never turn a durable state result into an ambiguous one.
        }
    }

    private boolean member(DSLContext context, CatalogScope scope) {
        return context.fetchExists(
                DSL.table(DSL.name("workspace_members")),
                DSL.field(DSL.name("workspace_id"), UUID.class)
                        .eq(scope.workspaceId())
                        .and(DSL.field(DSL.name("principal_id"), UUID.class).eq(scope.principalId())));
    }

    private UploadSession map(Record row) {
        return new UploadSession(
                row.get("id", UUID.class),
                new EntryId(row.get("entry_id", UUID.class)),
                new VersionId(row.get("version_id", UUID.class)),
                new EntryId(row.get("parent_id", UUID.class)),
                new FileName(row.get("name", String.class)),
                new ByteCount(row.get("expected_size_bytes", Long.class)),
                LocalObjectStorage.hex(row.get("expected_sha256", byte[].class)),
                LocalObjectStorage.hex(row.get("computed_sha256", byte[].class)),
                state(row),
                row.get("expires_at", OffsetDateTime.class).toInstant());
    }

    private UploadState state(Record row) {
        return UploadState.valueOf(row.get("state", String.class));
    }

    private byte[] intent(EntryId parentId, FileName name, ByteCount size, byte[] digest) {
        MessageDigest hash = sha256();
        hash.update(parentId.value().toString().getBytes(StandardCharsets.UTF_8));
        hash.update((byte) 0);
        hash.update(name.value().getBytes(StandardCharsets.UTF_8));
        hash.update((byte) 0);
        hash.update(size.decimal().getBytes(StandardCharsets.UTF_8));
        hash.update((byte) 0);
        if (digest != null) {
            hash.update(digest);
        }
        return hash.digest();
    }

    private MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private record ReceivingLease(
            CatalogScope scope,
            UUID uploadId,
            UUID workspaceId,
            UUID objectId,
            UUID attemptId,
            long fence,
            long expectedSize,
            byte[] expectedSha256,
            String previousTempKey) {}

    private record CompletionLease(Record row, UUID claimId) {}

    private record Cancellation(Record row, String temporaryKey, boolean expired) {}
}
