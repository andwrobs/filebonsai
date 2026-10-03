package com.filebonsai.catalog.persistence;

import static com.filebonsai.catalog.application.CatalogFailure.Reason.DEPTH_LIMIT_EXCEEDED;
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

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.filebonsai.catalog.application.CatalogCursor;
import com.filebonsai.catalog.application.CatalogFailure;
import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.application.CreateFolder;
import com.filebonsai.catalog.application.GetCommittedBytes;
import com.filebonsai.catalog.application.GetEntry;
import com.filebonsai.catalog.application.GetFolderDetails;
import com.filebonsai.catalog.application.GetWorkspaceRoot;
import com.filebonsai.catalog.application.ListChildren;
import com.filebonsai.catalog.application.ListOrder;
import com.filebonsai.catalog.application.MoveEntries;
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
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
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
        implements GetEntry,
                GetFolderDetails,
                GetWorkspaceRoot,
                ListChildren,
                CreateFolder,
                MoveEntries,
                GetCommittedBytes {
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
    // Added by V10.
    private static final Field<Long> REVISION = DSL.field(DSL.name("catalog_entries", "revision"), Long.class);
    private static final String CREATE_FOLDER_OPERATION = "create-folder";
    private static final String MOVE_ENTRIES_OPERATION = "move-entries";
    private static final ObjectMapper JSON = new ObjectMapper();

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
    public FolderDetails details(CatalogScope scope, EntryId folderId) {
        return database.transactionResult(configuration -> {
            DSLContext snapshot = DSL.using(configuration);
            snapshot.execute("set transaction isolation level repeatable read, read only");
            Entry.Folder folder = folder(snapshot, scope, folderId);
            return new FolderDetails(folder, ancestors(snapshot, scope, folderId));
        });
    }

    private List<Ancestor> ancestors(DSLContext context, CatalogScope scope, EntryId folderId) {
        // Anchor authorization and every recursive step to the same workspace. The depth cap is the folder depth
        // limit, so a deeper hierarchy can only be malformed; a truncated path must never appear as a breadcrumb.
        var rows = context.fetch(
                """
                with recursive path (id, parent_id, name, workspace_id, depth) as (
                    select n.entry_id, n.parent_id, n.name, n.workspace_id, 0
                    from catalog_names n
                    join catalog_entries e on e.id = n.entry_id and e.workspace_id = n.workspace_id
                    where n.entry_id = ? and n.workspace_id = ? and n.claim_kind = 'entry'
                      and e.kind = 'folder'
                      and exists (select 1 from workspace_members m
                                  where m.workspace_id = n.workspace_id and m.principal_id = ?)
                    union all
                    select n.entry_id, n.parent_id, n.name, n.workspace_id, path.depth + 1
                    from path
                    join catalog_names n on n.entry_id = path.parent_id
                        and n.workspace_id = path.workspace_id and n.claim_kind = 'entry'
                    join catalog_entries e on e.id = n.entry_id
                        and e.workspace_id = n.workspace_id and e.kind = 'folder'
                    where path.depth < ?
                )
                select id, parent_id, name from path order by depth desc
                """, folderId.value(), scope.workspaceId(), scope.principalId(), Entry.MAXIMUM_FOLDER_DEPTH);
        if (rows.isEmpty()) {
            throw new CatalogFailure(ENTRY_NOT_FOUND, "Entry was not found");
        }
        if (rows.getFirst().get("parent_id", UUID.class) != null) {
            throw new IllegalStateException("Folder ancestry exceeds the supported depth");
        }
        // The last row is the requested folder, not one of its ancestors.
        return rows.subList(0, rows.size() - 1).stream()
                .map(row -> new Ancestor(
                        new EntryId(row.get("id", UUID.class)), new FileName(row.get("name", String.class))))
                .toList();
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
    public Page list(CatalogScope scope, EntryId folderId, ListOrder order, Kind kind, int limit, String cursor) {
        if (limit < 1 || limit > 100) {
            throw new CatalogFailure(VALIDATION_FAILED, "Limit must be between 1 and 100");
        }
        folder(database, scope, folderId);
        ListOrder.Position after =
                cursor == null ? null : cursors.decode(cursor, scope.workspaceId(), folderId, order, kind);
        var rows = new ArrayList<Record>(limit + 1);
        if (kind != null) {
            // One group is one index range in the order's sequence, whatever the order's folder placement.
            rows.addAll(pageQuery(database, scope, folderId, order, kind == Kind.FOLDER, after, limit + 1)
                    .fetch());
        } else if (!order.foldersFirst()) {
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
            next = cursors.encode(scope.workspaceId(), folderId, order, kind, position(order, rows.get(limit - 1)));
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
                        REVISION,
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
        CatalogHierarchyLock.shared(transaction, scope.workspaceId());
        folder(transaction, scope, parentId);
        if (ancestors(transaction, scope, parentId).size() + 1 > Entry.MAXIMUM_FOLDER_DEPTH) {
            throw new CatalogFailure(DEPTH_LIMIT_EXCEEDED, "The folder would be deeper than the folder depth limit");
        }
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
        return new Entry.Folder(new EntryId(id), parentId, name, now.toInstant(), now.toInstant(), 1);
    }

    @Override
    public List<ItemResult> move(CatalogScope scope, EntryId destinationId, List<Item> items, UUID idempotencyKey) {
        Objects.requireNonNull(destinationId);
        Objects.requireNonNull(idempotencyKey);
        List<Item> normalized = MoveEntries.normalized(items);
        return database.transactionResult(
                configuration -> move(DSL.using(configuration), scope, destinationId, normalized, idempotencyKey));
    }

    private record Moving(UUID id, boolean folder, long revision, UUID parentId) {}

    private List<ItemResult> move(
            DSLContext transaction, CatalogScope scope, EntryId destinationId, List<Item> items, UUID idempotencyKey) {
        UUID workspace = scope.workspaceId();
        transaction.execute(
                "select pg_advisory_xact_lock(hashtextextended(?, 0))",
                workspace + ":" + scope.principalId() + ":" + MOVE_ENTRIES_OPERATION + ":" + idempotencyKey);
        byte[] intent = moveIntent(destinationId, items);
        OffsetDateTime now = transaction.fetchValue(DSL.field("current_timestamp", OffsetDateTime.class));
        Record replay = transaction.fetchOne(
                "select request_hash, result::text as result, expires_at from idempotency_records"
                        + " where workspace_id = ? and principal_id = ? and operation = ? and idempotency_key = ?",
                workspace,
                scope.principalId(),
                MOVE_ENTRIES_OPERATION,
                idempotencyKey);
        if (replay != null && !replay.get("expires_at", OffsetDateTime.class).isAfter(now)) {
            transaction.execute(
                    "delete from idempotency_records"
                            + " where workspace_id = ? and principal_id = ? and operation = ? and idempotency_key = ?",
                    workspace,
                    scope.principalId(),
                    MOVE_ENTRIES_OPERATION,
                    idempotencyKey);
            replay = null;
        }
        if (replay != null) {
            if (!MessageDigest.isEqual(intent, replay.get("request_hash", byte[].class))) {
                throw new CatalogFailure(IDEMPOTENCY_CONFLICT, "Idempotency key was already used for different input");
            }
            return readResults(replay.get("result", String.class));
        }

        UUID[] ids = items.stream().map(item -> item.entryId().value()).toArray(UUID[]::new);
        // Kind never changes, so this unlocked read safely chooses the hierarchy lock mode.
        boolean movesFolders = transaction.fetchExists(
                CATALOG_ENTRIES,
                CATALOG_ENTRIES
                        .WORKSPACE_ID
                        .eq(workspace)
                        .and(CATALOG_ENTRIES.ID.in(ids))
                        .and(CATALOG_ENTRIES.KIND.eq(FOLDER)));
        if (movesFolders) {
            CatalogHierarchyLock.exclusive(transaction, workspace);
        } else {
            CatalogHierarchyLock.shared(transaction, workspace);
        }
        folder(transaction, scope, destinationId);
        List<Ancestor> destinationAncestors = ancestors(transaction, scope, destinationId);
        Set<UUID> destinationPath = new HashSet<>();
        destinationAncestors.forEach(
                ancestor -> destinationPath.add(ancestor.id().value()));
        destinationPath.add(destinationId.value());

        // Entry rows first, in UUID order; the names are read after the locks so they are current.
        Map<UUID, Moving> moving = new HashMap<>();
        var lockedRows = transaction.fetch(
                "select id, kind, revision from catalog_entries where workspace_id = ? and id = any(?)"
                        + " order by id for update",
                workspace,
                DSL.val(ids));
        var parents = new HashMap<UUID, UUID>();
        transaction
                .fetch(
                        "select entry_id, parent_id from catalog_names"
                                + " where workspace_id = ? and claim_kind = 'entry' and entry_id = any(?)",
                        workspace,
                        DSL.val(ids))
                .forEach(row -> parents.put(row.get("entry_id", UUID.class), row.get("parent_id", UUID.class)));
        for (Record row : lockedRows) {
            UUID id = row.get("id", UUID.class);
            moving.put(
                    id,
                    new Moving(
                            id,
                            FOLDER.equals(row.get("kind", String.class)),
                            row.get("revision", Long.class),
                            parents.get(id)));
        }
        Map<UUID, UUID> carriedBy = movesFolders ? closestSelectedAncestors(transaction, workspace, moving) : Map.of();

        Map<UUID, ItemResult> results = new LinkedHashMap<>();
        for (Item item : items) {
            UUID id = item.entryId().value();
            Moving entry = moving.get(id);
            if (entry == null) {
                results.put(id, new ItemResult(item.entryId(), Outcome.NOT_FOUND, null, null));
            } else if (!carriedBy.containsKey(id)) {
                results.put(
                        id,
                        moveOne(
                                transaction,
                                workspace,
                                destinationId,
                                destinationPath,
                                destinationAncestors.size(),
                                item,
                                entry));
            }
        }
        for (Item item : items) {
            UUID id = item.entryId().value();
            if (carriedBy.containsKey(id)) {
                UUID top = carriedBy.get(id);
                while (carriedBy.containsKey(top)) {
                    top = carriedBy.get(top);
                }
                Outcome outcome = results.get(top).outcome() == Outcome.MOVED
                        ? Outcome.MOVED_WITH_ANCESTOR
                        : Outcome.ANCESTOR_NOT_MOVED;
                results.put(
                        id,
                        new ItemResult(item.entryId(), outcome, moving.get(id).revision(), null));
            }
        }
        List<ItemResult> ordered =
                items.stream().map(item -> results.get(item.entryId().value())).toList();
        transaction.execute(
                "insert into idempotency_records (workspace_id, principal_id, operation, idempotency_key,"
                        + " request_hash, response_entry_id, result, created_at, expires_at)"
                        + " values (?, ?, ?, ?, ?, null, ?::jsonb,"
                        + " current_timestamp, current_timestamp + interval '30 days')",
                workspace,
                scope.principalId(),
                MOVE_ENTRIES_OPERATION,
                idempotencyKey,
                intent,
                writeResults(ordered));
        return ordered;
    }

    private ItemResult moveOne(
            DSLContext transaction,
            UUID workspace,
            EntryId destinationId,
            Set<UUID> destinationPath,
            int destinationDepth,
            Item item,
            Moving entry) {
        EntryId id = item.entryId();
        if (entry.parentId() == null) {
            return new ItemResult(id, Outcome.CANNOT_MOVE_ROOT, entry.revision(), null);
        }
        if (entry.parentId().equals(destinationId.value())) {
            return new ItemResult(id, Outcome.UNCHANGED, entry.revision(), null);
        }
        if (entry.revision() != item.expectedRevision()) {
            return new ItemResult(id, Outcome.REVISION_CONFLICT, entry.revision(), null);
        }
        if (entry.folder() && destinationPath.contains(entry.id())) {
            return new ItemResult(id, Outcome.DESTINATION_INSIDE_ENTRY, entry.revision(), null);
        }
        if (entry.folder() && exceedsDepth(transaction, workspace, entry.id(), destinationDepth)) {
            return new ItemResult(id, Outcome.DEPTH_LIMIT_EXCEEDED, entry.revision(), null);
        }
        // A uniqueness violation aborts the statement; the savepoint keeps the other items' moves.
        transaction.execute("savepoint move_entry");
        try {
            transaction.execute(
                    "update catalog_names set parent_id = ?"
                            + " where workspace_id = ? and entry_id = ? and claim_kind = 'entry'",
                    destinationId.value(),
                    workspace,
                    entry.id());
        } catch (DataAccessException exception) {
            if (!"23505".equals(exception.sqlState())) {
                throw exception;
            }
            transaction.execute("rollback to savepoint move_entry");
            return new ItemResult(id, Outcome.NAME_CONFLICT, entry.revision(), null);
        }
        transaction.execute("release savepoint move_entry");
        long revision = transaction
                .fetchSingle(
                        "update catalog_entries set revision = revision + 1"
                                + " where workspace_id = ? and id = ? returning revision",
                        workspace,
                        entry.id())
                .get(0, Long.class);
        return new ItemResult(id, Outcome.MOVED, revision, new EntryId(entry.parentId()));
    }

    /** Whether the folder's subtree, placed under a destination at this depth, would pass the depth limit. */
    private static boolean exceedsDepth(DSLContext transaction, UUID workspace, UUID folderId, int destinationDepth) {
        // The folder lands at destinationDepth + 1, so its subtree may be at most this many levels deep.
        int allowed = Entry.MAXIMUM_FOLDER_DEPTH - destinationDepth - 1;
        if (allowed < 0) {
            return true;
        }
        Integer height =
                transaction.fetchSingle("""
                        with recursive down (id, depth) as (
                            select ?::uuid, 0
                            union all
                            select n.entry_id, down.depth + 1
                            from down
                            join catalog_names n on n.workspace_id = ? and n.parent_id = down.id
                                and n.claim_kind = 'entry' and n.entry_kind = 'folder'
                            where down.depth <= ?
                        )
                        select max(depth) from down
                        """, folderId, workspace, allowed).get(0, Integer.class);
        return height > allowed;
    }

    /** For each selected entry inside another selected folder, the closest such folder. */
    private static Map<UUID, UUID> closestSelectedAncestors(
            DSLContext transaction, UUID workspace, Map<UUID, Moving> moving) {
        UUID[] selected = moving.keySet().toArray(UUID[]::new);
        UUID[] folders =
                moving.values().stream().filter(Moving::folder).map(Moving::id).toArray(UUID[]::new);
        var carriedBy = new HashMap<UUID, UUID>();
        transaction
                .fetch(
                        """
                        with recursive up (item, node, depth) as (
                            select n.entry_id, n.parent_id, 1
                            from catalog_names n
                            where n.workspace_id = ? and n.claim_kind = 'entry' and n.entry_id = any(?)
                            union all
                            select up.item, n.parent_id, up.depth + 1
                            from up
                            join catalog_names n on n.workspace_id = ? and n.claim_kind = 'entry'
                                and n.entry_id = up.node
                            where not (up.node = any(?)) and up.depth <= ?
                        )
                        select distinct on (item) item, node from up
                        where node = any(?)
                        order by item, depth
                        """,
                        workspace,
                        DSL.val(selected),
                        workspace,
                        DSL.val(folders),
                        Entry.MAXIMUM_FOLDER_DEPTH,
                        DSL.val(folders))
                .forEach(row -> carriedBy.put(row.get("item", UUID.class), row.get("node", UUID.class)));
        return carriedBy;
    }

    private static String writeResults(List<ItemResult> results) {
        var array = JSON.createArrayNode();
        for (ItemResult result : results) {
            var node = array.addObject();
            node.put("entryId", result.entryId().value().toString());
            node.put("outcome", result.outcome().name());
            if (result.revision() != null) {
                node.put("revision", result.revision());
            }
            if (result.previousParentId() != null) {
                node.put("previousParentId", result.previousParentId().value().toString());
            }
        }
        return array.toString();
    }

    private static List<ItemResult> readResults(String json) {
        try {
            var results = new ArrayList<ItemResult>();
            for (JsonNode node : JSON.readTree(json)) {
                results.add(new ItemResult(
                        new EntryId(UUID.fromString(node.get("entryId").asText())),
                        Outcome.valueOf(node.get("outcome").asText()),
                        node.has("revision") ? node.get("revision").asLong() : null,
                        node.has("previousParentId")
                                ? new EntryId(UUID.fromString(
                                        node.get("previousParentId").asText()))
                                : null));
            }
            return results;
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored move result is not valid JSON", exception);
        }
    }

    /** Destination, then each normalized item's ID and expected revision. */
    private static byte[] moveIntent(EntryId destinationId, List<Item> items) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(destinationId.value().toString().getBytes(StandardCharsets.UTF_8));
            for (Item item : items) {
                digest.update((byte) 0);
                digest.update(
                        (item.entryId().value() + ":" + item.expectedRevision()).getBytes(StandardCharsets.UTF_8));
            }
            return digest.digest();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the Java runtime", exception);
        }
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
                        REVISION,
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
        long revision = row.get(REVISION);
        if (FOLDER.equals(row.get(CATALOG_ENTRIES.KIND))) {
            return new Entry.Folder(id, parent == null ? null : new EntryId(parent), name, created, updated, revision);
        }
        byte[] digest = row.get(OBJECT_SHA256);
        return new Entry.File(
                id,
                new EntryId(parent),
                name,
                created,
                updated,
                revision,
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
