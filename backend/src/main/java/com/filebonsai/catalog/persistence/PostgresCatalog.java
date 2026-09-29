package com.filebonsai.catalog.persistence;

import static com.filebonsai.catalog.application.CatalogFailure.Reason.ENTRY_NOT_FOUND;
import static com.filebonsai.catalog.application.CatalogFailure.Reason.IDEMPOTENCY_CONFLICT;
import static com.filebonsai.catalog.application.CatalogFailure.Reason.NAME_CONFLICT;
import static com.filebonsai.catalog.application.CatalogFailure.Reason.NOT_A_FOLDER;
import static com.filebonsai.catalog.application.CatalogFailure.Reason.VALIDATION_FAILED;
import static com.filebonsai.catalog.persistence.jooq.Tables.CATALOG_ENTRIES;
import static com.filebonsai.catalog.persistence.jooq.Tables.CATALOG_NAMES;
import static com.filebonsai.catalog.persistence.jooq.Tables.FILE_VERSIONS;
import static com.filebonsai.catalog.persistence.jooq.Tables.IDEMPOTENCY_RECORDS;
import static com.filebonsai.catalog.persistence.jooq.Tables.PHYSICAL_OBJECTS;
import static com.filebonsai.catalog.persistence.jooq.Tables.WORKSPACE_MEMBERS;

import com.filebonsai.catalog.application.CatalogCursor;
import com.filebonsai.catalog.application.CatalogFailure;
import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.application.CreateFolder;
import com.filebonsai.catalog.application.GetCommittedBytes;
import com.filebonsai.catalog.application.GetEntry;
import com.filebonsai.catalog.application.GetWorkspaceRoot;
import com.filebonsai.catalog.application.ListChildren;
import com.filebonsai.catalog.application.ListOrder;
import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.catalog.domain.Entry;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import com.filebonsai.catalog.domain.VersionId;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.Record;
import org.jooq.ResultQuery;
import org.jooq.RowN;
import org.jooq.exception.DataAccessException;
import org.jooq.impl.DSL;

public final class PostgresCatalog
        implements GetEntry, GetWorkspaceRoot, ListChildren, CreateFolder, GetCommittedBytes {
    private static final String ENTRY_CLAIM = "entry";
    private static final String RESERVATION_CLAIM = "reservation";
    private static final String FOLDER = "folder";
    private static final String FILE = "file";
    // V9 copies of the entry's sort keys onto its name; jOOQ classes are generated from V1 only.
    private static final Field<String> SORT_KIND = DSL.field(DSL.name("catalog_names", "entry_kind"), String.class);
    private static final Field<OffsetDateTime> SORT_UPDATED_AT =
            DSL.field(DSL.name("catalog_names", "entry_updated_at"), OffsetDateTime.class);
    // Must match the ix_catalog_names_page_size expression, including the inline -1.
    private static final Field<Long> SORT_SIZE = DSL.field(
            "coalesce({0}, -1)", Long.class, DSL.field(DSL.name("catalog_names", "entry_size_bytes"), Long.class));
    private static final Field<String> SORT_NAME = DSL.field("{0} collate \"C\"", String.class, CATALOG_NAMES.NAME);
    // Added by V7, after the generated classes.
    private static final Field<byte[]> OBJECT_SHA256 = DSL.field(DSL.name("physical_objects", "sha256"), byte[].class);
    private static final Field<Integer> VERSION_COUNT = versionCount();
    private static final String CREATE_FOLDER_OPERATION = "create-folder";

    private final DSLContext database;
    private final CatalogCursor cursors;

    public PostgresCatalog(DSLContext database, CatalogCursor cursors) {
        this.database = database;
        this.cursors = cursors;
    }

    @Override
    public Entry get(CatalogScope scope, EntryId id) {
        return getInternal(database, scope, id);
    }

    @Override
    public Entry.Folder get(CatalogScope scope) {
        UUID rootId = database.select(CATALOG_ENTRIES.ID)
                .from(CATALOG_ENTRIES)
                .join(CATALOG_NAMES)
                .on(CATALOG_NAMES.ENTRY_ID.eq(CATALOG_ENTRIES.ID).and(CATALOG_NAMES.CLAIM_KIND.eq(ENTRY_CLAIM)))
                .where(CATALOG_ENTRIES.WORKSPACE_ID.eq(scope.workspaceId()))
                .and(member(scope))
                .and(CATALOG_ENTRIES.KIND.eq(FOLDER))
                .and(CATALOG_NAMES.PARENT_ID.isNull())
                .fetchOne(CATALOG_ENTRIES.ID);
        if (rootId == null) {
            throw new CatalogFailure(ENTRY_NOT_FOUND, "Workspace root was not found");
        }
        return folder(database, scope, new EntryId(rootId));
    }

    @Override
    public ByteCount committedBytes(CatalogScope scope) {
        // Versions are inserted only in the publication transaction, so staged uploads are never counted.
        BigDecimal total = database.select(DSL.coalesce(DSL.sum(FILE_VERSIONS.SIZE_BYTES), BigDecimal.ZERO))
                .from(FILE_VERSIONS)
                .where(FILE_VERSIONS.WORKSPACE_ID.eq(scope.workspaceId()))
                .and(member(scope))
                .fetchSingle()
                .value1();
        return new ByteCount(total.longValueExact());
    }

    @Override
    public Page list(CatalogScope scope, EntryId folderId, ListOrder order, int limit, String cursor) {
        if (limit < 1 || limit > 100) {
            throw new CatalogFailure(VALIDATION_FAILED, "Limit must be between 1 and 100");
        }
        folder(database, scope, folderId);
        ListOrder.Position after = cursor == null ? null : cursors.decode(cursor, scope.workspaceId(), folderId, order);
        var rows = new ArrayList<Record>(limit + 1);
        if (!order.foldersFirst()) {
            rows.addAll(pageQuery(database, scope, folderId, order, null, after, limit + 1)
                    .fetch());
        } else {
            // Folders, then files: each group is one index range, so neither needs a sort.
            if (after == null || after.folder()) {
                rows.addAll(pageQuery(database, scope, folderId, order, true, after, limit + 1)
                        .fetch());
            }
            if (rows.size() <= limit) {
                ListOrder.Position fileAfter = after == null || after.folder() ? null : after;
                rows.addAll(pageQuery(database, scope, folderId, order, false, fileAfter, limit + 1 - rows.size())
                        .fetch());
            }
        }
        var entries = new ArrayList<Entry>(Math.min(limit, rows.size()));
        for (int index = 0; index < Math.min(limit, rows.size()); index++) {
            entries.add(map(rows.get(index)));
        }
        String next = null;
        if (rows.size() > limit) {
            next = cursors.encode(scope.workspaceId(), folderId, order, position(order, rows.get(limit - 1)));
        }
        return new Page(entries, next);
    }

    /**
     * One index range of a folder's children in the order's sequence. {@code folders} limits the range to folders or
     * files when it is not null. Package-private so tests can inspect the plan.
     */
    ResultQuery<? extends Record> pageQuery(
            DSLContext context,
            CatalogScope scope,
            EntryId folderId,
            ListOrder order,
            Boolean folders,
            ListOrder.Position after,
            int limit) {
        List<Field<?>> keys = new ArrayList<>(3);
        var values = new ArrayList<Object>(3);
        Condition group = DSL.noCondition();
        if (folders != null) {
            group = SORT_KIND.eq(folders ? FOLDER : FILE);
        }
        // Every folder sizes as -1, so name and ID alone order the folder group, by the folders-first index.
        boolean sized = order.key() == ListOrder.Key.SIZE && !Boolean.TRUE.equals(folders);
        if (order.key() == ListOrder.Key.UPDATED_AT) {
            keys.add(SORT_UPDATED_AT);
            if (after != null) {
                values.add(OffsetDateTime.ofInstant(ListOrder.fromEpochMicros(after.key()), ZoneOffset.UTC));
            }
        } else if (sized) {
            keys.add(SORT_SIZE);
            if (after != null) {
                values.add(after.key());
            }
            if (folders != null) {
                // Files are exactly the sizes from 0, a range of the size index that skips every folder.
                group = SORT_SIZE.ge(0L);
            }
        }
        keys.add(SORT_NAME);
        keys.add(CATALOG_NAMES.ENTRY_ID);
        Condition afterPosition = DSL.noCondition();
        if (after != null) {
            values.add(after.name());
            values.add(after.id());
            RowN row = DSL.row(keys);
            afterPosition = order.descending() ? row.lt(values.toArray()) : row.gt(values.toArray());
        }
        return context.select(
                        CATALOG_ENTRIES.ID,
                        CATALOG_NAMES.PARENT_ID,
                        CATALOG_NAMES.NAME,
                        CATALOG_ENTRIES.KIND,
                        CATALOG_ENTRIES.CREATED_AT,
                        CATALOG_ENTRIES.UPDATED_AT,
                        FILE_VERSIONS.ID,
                        FILE_VERSIONS.SIZE_BYTES,
                        OBJECT_SHA256,
                        VERSION_COUNT,
                        SORT_KIND,
                        SORT_UPDATED_AT,
                        SORT_SIZE)
                .from(CATALOG_NAMES)
                .join(CATALOG_ENTRIES)
                .on(CATALOG_ENTRIES.ID.eq(CATALOG_NAMES.ENTRY_ID))
                .leftJoin(FILE_VERSIONS)
                .on(FILE_VERSIONS.ID.eq(CATALOG_ENTRIES.CURRENT_VERSION_ID))
                .leftJoin(PHYSICAL_OBJECTS)
                .on(currentObject())
                .where(CATALOG_NAMES.WORKSPACE_ID.eq(scope.workspaceId()))
                .and(CATALOG_NAMES.PARENT_ID.eq(folderId.value()))
                // A literal, so even a generic plan can prove the partial indexes' predicate.
                .and(CATALOG_NAMES.CLAIM_KIND.eq(DSL.inline(ENTRY_CLAIM)))
                .and(CATALOG_ENTRIES.WORKSPACE_ID.eq(scope.workspaceId()))
                .and(member(scope))
                .and(group)
                .and(afterPosition)
                .orderBy(keys.stream()
                        .map(key -> order.descending() ? key.desc() : key.asc())
                        .toList())
                .limit(limit);
    }

    /** Positions come from the copied sort keys the index orders by, not from the entry's own columns. */
    static ListOrder.Position position(ListOrder order, Record row) {
        Long key =
                switch (order.key()) {
                    case NAME -> null;
                    case UPDATED_AT ->
                        ListOrder.epochMicros(row.get(SORT_UPDATED_AT).toInstant());
                    case SIZE -> row.get(SORT_SIZE);
                };
        return new ListOrder.Position(
                FOLDER.equals(row.get(SORT_KIND)), key, row.get(CATALOG_NAMES.NAME), row.get(CATALOG_ENTRIES.ID));
    }

    @Override
    public Entry.Folder create(CatalogScope scope, EntryId parentId, FileName name, UUID idempotencyKey) {
        Objects.requireNonNull(idempotencyKey);
        try {
            return database.transactionResult(
                    configuration -> create(DSL.using(configuration), scope, parentId, name, idempotencyKey));
        } catch (DataAccessException exception) {
            if ("23505".equals(exception.sqlState())) {
                throw new CatalogFailure(NAME_CONFLICT, "A sibling entry or pending upload already reserves this name");
            }
            throw exception;
        }
    }

    private Entry.Folder create(
            DSLContext transaction, CatalogScope scope, EntryId parentId, FileName name, UUID idempotencyKey) {
        String lockIdentity = scope.workspaceId() + ":" + scope.principalId() + ":" + idempotencyKey;
        transaction.execute("select pg_advisory_xact_lock(hashtextextended(?, 0))", lockIdentity);
        byte[] intent = intent(parentId, name);
        OffsetDateTime now = transaction.fetchValue(DSL.field("current_timestamp", OffsetDateTime.class));
        var replay = transaction
                .select(
                        IDEMPOTENCY_RECORDS.REQUEST_HASH,
                        IDEMPOTENCY_RECORDS.RESPONSE_ENTRY_ID,
                        IDEMPOTENCY_RECORDS.EXPIRES_AT)
                .from(IDEMPOTENCY_RECORDS)
                .where(IDEMPOTENCY_RECORDS.WORKSPACE_ID.eq(scope.workspaceId()))
                .and(IDEMPOTENCY_RECORDS.PRINCIPAL_ID.eq(scope.principalId()))
                .and(IDEMPOTENCY_RECORDS.OPERATION.eq(CREATE_FOLDER_OPERATION))
                .and(IDEMPOTENCY_RECORDS.IDEMPOTENCY_KEY.eq(idempotencyKey))
                .fetchOne();
        if (replay != null && !replay.value3().isAfter(now)) {
            transaction
                    .deleteFrom(IDEMPOTENCY_RECORDS)
                    .where(IDEMPOTENCY_RECORDS.WORKSPACE_ID.eq(scope.workspaceId()))
                    .and(IDEMPOTENCY_RECORDS.PRINCIPAL_ID.eq(scope.principalId()))
                    .and(IDEMPOTENCY_RECORDS.OPERATION.eq(CREATE_FOLDER_OPERATION))
                    .and(IDEMPOTENCY_RECORDS.IDEMPOTENCY_KEY.eq(idempotencyKey))
                    .execute();
            replay = null;
        }
        if (replay != null) {
            if (!MessageDigest.isEqual(intent, replay.value1())) {
                throw new CatalogFailure(IDEMPOTENCY_CONFLICT, "Idempotency key was already used for different input");
            }
            Entry replayed = getInternal(transaction, scope, new EntryId(replay.value2()));
            if (replayed instanceof Entry.Folder folder) {
                return folder;
            }
            throw new IllegalStateException("Create-folder replay does not refer to a folder");
        }
        folder(transaction, scope, parentId);
        UUID id = UUID.randomUUID();
        transaction
                .deleteFrom(CATALOG_NAMES)
                .where(CATALOG_NAMES.WORKSPACE_ID.eq(scope.workspaceId()))
                .and(CATALOG_NAMES.PARENT_ID.eq(parentId.value()))
                .and(CATALOG_NAMES.NAME.eq(name.value()))
                .and(CATALOG_NAMES.CLAIM_KIND.eq(RESERVATION_CLAIM))
                .and(CATALOG_NAMES.EXPIRES_AT.le(now))
                .execute();
        transaction
                .insertInto(CATALOG_ENTRIES)
                .columns(
                        CATALOG_ENTRIES.ID,
                        CATALOG_ENTRIES.WORKSPACE_ID,
                        CATALOG_ENTRIES.KIND,
                        CATALOG_ENTRIES.CREATED_AT,
                        CATALOG_ENTRIES.UPDATED_AT,
                        CATALOG_ENTRIES.CURRENT_VERSION_ID)
                .values(id, scope.workspaceId(), FOLDER, now, now, null)
                .execute();
        transaction
                .insertInto(CATALOG_NAMES)
                .columns(
                        CATALOG_NAMES.ID,
                        CATALOG_NAMES.WORKSPACE_ID,
                        CATALOG_NAMES.PARENT_ID,
                        CATALOG_NAMES.NAME,
                        CATALOG_NAMES.CLAIM_KIND,
                        CATALOG_NAMES.ENTRY_ID,
                        CATALOG_NAMES.EXPIRES_AT,
                        CATALOG_NAMES.CREATED_AT)
                .values(
                        UUID.randomUUID(),
                        scope.workspaceId(),
                        parentId.value(),
                        name.value(),
                        ENTRY_CLAIM,
                        id,
                        null,
                        now)
                .execute();
        transaction
                .insertInto(IDEMPOTENCY_RECORDS)
                .columns(
                        IDEMPOTENCY_RECORDS.WORKSPACE_ID,
                        IDEMPOTENCY_RECORDS.PRINCIPAL_ID,
                        IDEMPOTENCY_RECORDS.OPERATION,
                        IDEMPOTENCY_RECORDS.IDEMPOTENCY_KEY,
                        IDEMPOTENCY_RECORDS.REQUEST_HASH,
                        IDEMPOTENCY_RECORDS.RESPONSE_ENTRY_ID,
                        IDEMPOTENCY_RECORDS.CREATED_AT,
                        IDEMPOTENCY_RECORDS.EXPIRES_AT)
                .values(
                        scope.workspaceId(),
                        scope.principalId(),
                        CREATE_FOLDER_OPERATION,
                        idempotencyKey,
                        intent,
                        id,
                        now,
                        now.plusDays(30))
                .execute();
        return new Entry.Folder(new EntryId(id), parentId, name, now.toInstant(), now.toInstant());
    }

    private Condition member(CatalogScope scope) {
        return DSL.exists(DSL.selectOne()
                .from(WORKSPACE_MEMBERS)
                .where(WORKSPACE_MEMBERS.WORKSPACE_ID.eq(scope.workspaceId()))
                .and(WORKSPACE_MEMBERS.PRINCIPAL_ID.eq(scope.principalId())));
    }

    private static Condition currentObject() {
        return PHYSICAL_OBJECTS
                .WORKSPACE_ID
                .eq(FILE_VERSIONS.WORKSPACE_ID)
                .and(PHYSICAL_OBJECTS.ID.eq(FILE_VERSIONS.OBJECT_ID));
    }

    /** Every committed version of the row's entry; zero for a folder. Read through the (entry, ordinal) index. */
    private static Field<Integer> versionCount() {
        var counted = FILE_VERSIONS.as("counted_versions");
        return DSL.field(DSL.selectCount().from(counted).where(counted.ENTRY_ID.eq(CATALOG_ENTRIES.ID)))
                .as("version_count");
    }

    private Entry.Folder folder(DSLContext context, CatalogScope scope, EntryId id) {
        Entry entry = getInternal(context, scope, id);
        if (entry instanceof Entry.Folder folder) {
            return folder;
        }
        throw new CatalogFailure(NOT_A_FOLDER, "Entry is not a folder");
    }

    private Entry getInternal(DSLContext context, CatalogScope scope, EntryId id) {
        var row = context.select(
                        CATALOG_ENTRIES.ID,
                        CATALOG_NAMES.PARENT_ID,
                        CATALOG_NAMES.NAME,
                        CATALOG_ENTRIES.KIND,
                        CATALOG_ENTRIES.CREATED_AT,
                        CATALOG_ENTRIES.UPDATED_AT,
                        FILE_VERSIONS.ID,
                        FILE_VERSIONS.SIZE_BYTES,
                        OBJECT_SHA256,
                        VERSION_COUNT)
                .from(CATALOG_ENTRIES)
                .join(CATALOG_NAMES)
                .on(CATALOG_NAMES.ENTRY_ID.eq(CATALOG_ENTRIES.ID).and(CATALOG_NAMES.CLAIM_KIND.eq(ENTRY_CLAIM)))
                .leftJoin(FILE_VERSIONS)
                .on(FILE_VERSIONS.ID.eq(CATALOG_ENTRIES.CURRENT_VERSION_ID))
                .leftJoin(PHYSICAL_OBJECTS)
                .on(currentObject())
                .where(CATALOG_ENTRIES.WORKSPACE_ID.eq(scope.workspaceId()))
                .and(member(scope))
                .and(CATALOG_ENTRIES.ID.eq(id.value()))
                .fetchOne();
        if (row == null) {
            throw new CatalogFailure(ENTRY_NOT_FOUND, "Entry was not found");
        }
        return map(row);
    }

    private Entry map(Record row) {
        var id = new EntryId(row.get(CATALOG_ENTRIES.ID));
        UUID parent = row.get(CATALOG_NAMES.PARENT_ID);
        var name = new FileName(row.get(CATALOG_NAMES.NAME));
        var created = row.get(CATALOG_ENTRIES.CREATED_AT).toInstant();
        var updated = row.get(CATALOG_ENTRIES.UPDATED_AT).toInstant();
        if (FOLDER.equals(row.get(CATALOG_ENTRIES.KIND))) {
            return new Entry.Folder(id, parent == null ? null : new EntryId(parent), name, created, updated);
        }
        byte[] digest = row.get(OBJECT_SHA256);
        return new Entry.File(
                id,
                new EntryId(parent),
                name,
                created,
                updated,
                new Entry.Version(
                        new VersionId(row.get(FILE_VERSIONS.ID)),
                        new ByteCount(row.get(FILE_VERSIONS.SIZE_BYTES)),
                        digest == null ? null : HexFormat.of().formatHex(digest)),
                row.get(VERSION_COUNT));
    }

    private byte[] intent(EntryId parentId, FileName name) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(parentId.value().toString().getBytes(StandardCharsets.UTF_8));
            digest.update((byte) 0);
            return digest.digest(name.value().getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the Java runtime", exception);
        }
    }
}
