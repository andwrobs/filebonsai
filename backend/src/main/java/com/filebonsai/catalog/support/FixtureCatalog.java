package com.filebonsai.catalog.support;

import static com.filebonsai.catalog.application.CatalogFailure.Reason.DEPTH_LIMIT_EXCEEDED;
import static com.filebonsai.catalog.application.CatalogFailure.Reason.ENTRY_NOT_FOUND;
import static com.filebonsai.catalog.application.CatalogFailure.Reason.IDEMPOTENCY_CONFLICT;
import static com.filebonsai.catalog.application.CatalogFailure.Reason.NAME_CONFLICT;
import static com.filebonsai.catalog.application.CatalogFailure.Reason.NOT_A_FOLDER;
import static com.filebonsai.catalog.application.CatalogFailure.Reason.VALIDATION_FAILED;

import com.filebonsai.catalog.application.CatalogCursor;
import com.filebonsai.catalog.application.CatalogFailure;
import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.application.CreateFolder;
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
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Demo adapter: synchronized atomic operations, process-local data. No durability or real authentication. */
public final class FixtureCatalog
        implements GetEntry, GetFolderDetails, GetWorkspaceRoot, ListChildren, CreateFolder, MoveEntries {
    public static final UUID WORKSPACE = UUID.fromString("10000000-0000-4000-8000-000000000001");
    public static final UUID PRINCIPAL = UUID.fromString("20000000-0000-4000-8000-000000000001");
    public static final EntryId ROOT = new EntryId(UUID.fromString("00000000-0000-4000-8000-000000000001"));
    public static final EntryId FILE = new EntryId(UUID.fromString("00000000-0000-4000-8000-000000000002"));
    public static final EntryId EMPTY = new EntryId(UUID.fromString("00000000-0000-4000-8000-000000000003"));

    private final Map<EntryId, Entry> entries = new HashMap<>();
    private final Map<ReplayKey, Replay> replays = new HashMap<>();
    private final Map<ReplayKey, MoveReplay> moveReplays = new HashMap<>();
    private final Set<Reservation> reservations = new HashSet<>();
    private final CatalogCursor cursors;
    private final Clock clock;

    private record ReplayKey(CatalogScope scope, UUID key) {}

    private record Intent(EntryId parent, FileName name) {}

    private record Replay(Intent intent, Entry.Folder result) {}

    private record MoveIntent(EntryId destination, List<Item> items) {}

    private record MoveReplay(MoveIntent intent, List<ItemResult> results) {}

    private record Reservation(EntryId parent, FileName name) {}

    FixtureCatalog(CatalogCursor cursors, Clock clock) {
        this.cursors = cursors;
        this.clock = clock;
        Instant time = Instant.parse("2026-01-01T00:00:00Z");
        entries.put(ROOT, new Entry.Folder(ROOT, null, new FileName("Library"), time, time, 1));
        entries.put(
                FILE,
                new Entry.File(
                        FILE,
                        ROOT,
                        new FileName("Italy.pdf"),
                        time,
                        time,
                        1,
                        new Entry.Version(
                                new VersionId(UUID.fromString("30000000-0000-4000-8000-000000000001")),
                                new ByteCount(9007199254740993L),
                                "4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358"),
                        1));
        entries.put(EMPTY, new Entry.Folder(EMPTY, ROOT, new FileName("Recipes"), time, time, 1));
        reservations.add(new Reservation(ROOT, new FileName("pending-upload.bin")));
    }

    @Override
    public synchronized Entry get(CatalogScope scope, EntryId id) {
        authorize(scope);
        Entry entry = entries.get(id);
        if (entry == null) {
            throw new CatalogFailure(ENTRY_NOT_FOUND, "Entry was not found");
        }
        return entry;
    }

    @Override
    public synchronized FolderDetails details(CatalogScope scope, EntryId folderId) {
        return new FolderDetails(folder(scope, folderId), ancestors(scope, folderId));
    }

    private List<Ancestor> ancestors(CatalogScope scope, EntryId folderId) {
        Entry.Folder current = folder(scope, folderId);
        var ancestors = new ArrayList<Ancestor>();
        while (current.parentId() != null) {
            current = folder(scope, current.parentId());
            ancestors.add(new Ancestor(current.id(), current.name()));
        }
        return ancestors.reversed();
    }

    @Override
    public synchronized Entry.Folder get(CatalogScope scope) {
        return (Entry.Folder) get(scope, ROOT);
    }

    @Override
    public synchronized Page list(
            CatalogScope scope, EntryId folderId, ListOrder order, Kind kind, int limit, String cursor) {
        folder(scope, folderId);
        if (limit < 1 || limit > 100) {
            throw new CatalogFailure(VALIDATION_FAILED, "Limit must be between 1 and 100");
        }
        var after = cursor == null ? null : cursors.decode(cursor, scope.workspaceId(), folderId, order, kind);
        var comparator = order.comparator();
        List<Entry> eligible = entries.values().stream()
                .filter(entry -> folderId.equals(entry.parentId()))
                .filter(entry -> kind == null || (kind == Kind.FOLDER) == (entry instanceof Entry.Folder))
                .filter(entry -> after == null || comparator.compare(order.position(entry), after) > 0)
                .sorted(Comparator.comparing(order::position, comparator))
                .limit(limit + 1L)
                .toList();
        List<Entry> page = eligible.subList(0, Math.min(limit, eligible.size()));
        String next = null;
        if (eligible.size() > limit) {
            next = cursors.encode(scope.workspaceId(), folderId, order, kind, order.position(page.getLast()));
        }
        return new Page(page, next);
    }

    @Override
    public synchronized Entry.Folder create(CatalogScope scope, EntryId parentId, FileName name, UUID key) {
        folder(scope, parentId);
        Objects.requireNonNull(key);
        Objects.requireNonNull(name);
        var replayKey = new ReplayKey(scope, key);
        var intent = new Intent(parentId, name);
        Replay previous = replays.get(replayKey);
        if (previous != null) {
            if (!previous.intent().equals(intent)) {
                throw new CatalogFailure(IDEMPOTENCY_CONFLICT, "Idempotency key was already used for different input");
            }
            return previous.result();
        }
        if (nameTaken(parentId, name)) {
            throw new CatalogFailure(NAME_CONFLICT, "A sibling entry or pending upload already reserves this name");
        }
        if (ancestors(scope, parentId).size() + 1 > Entry.MAXIMUM_FOLDER_DEPTH) {
            throw new CatalogFailure(DEPTH_LIMIT_EXCEEDED, "The folder would be deeper than the folder depth limit");
        }
        Instant now = clock.instant();
        var created = new Entry.Folder(new EntryId(UUID.randomUUID()), parentId, name, now, now, 1);
        entries.put(created.id(), created);
        replays.put(replayKey, new Replay(intent, created));
        return created;
    }

    @Override
    public synchronized List<ItemResult> move(
            CatalogScope scope, EntryId destinationId, List<Item> items, UUID idempotencyKey) {
        Objects.requireNonNull(idempotencyKey);
        List<Item> normalized = MoveEntries.normalized(items);
        var replayKey = new ReplayKey(scope, idempotencyKey);
        var intent = new MoveIntent(destinationId, normalized);
        MoveReplay previous = moveReplays.get(replayKey);
        if (previous != null) {
            if (!previous.intent().equals(intent)) {
                throw new CatalogFailure(IDEMPOTENCY_CONFLICT, "Idempotency key was already used for different input");
            }
            return previous.results();
        }
        folder(scope, destinationId);
        var destinationPath = new HashSet<EntryId>();
        ancestors(scope, destinationId).forEach(ancestor -> destinationPath.add(ancestor.id()));
        destinationPath.add(destinationId);
        int destinationDepth = destinationPath.size() - 1;
        Set<EntryId> selected = new HashSet<>();
        normalized.forEach(item -> selected.add(item.entryId()));
        // Closest selected ancestors, from the hierarchy as it is before anything moves.
        var carriedBy = new HashMap<EntryId, EntryId>();
        for (Item item : normalized) {
            Entry entry = entries.get(item.entryId());
            for (EntryId parent = entry == null ? null : entry.parentId();
                    parent != null;
                    parent = entries.get(parent).parentId()) {
                if (selected.contains(parent)) {
                    carriedBy.put(item.entryId(), parent);
                    break;
                }
            }
        }
        var results = new HashMap<EntryId, ItemResult>();
        for (Item item : normalized) {
            Entry entry = entries.get(item.entryId());
            if (entry == null) {
                results.put(item.entryId(), new ItemResult(item.entryId(), Outcome.NOT_FOUND, null, null));
            } else if (!carriedBy.containsKey(item.entryId())) {
                results.put(item.entryId(), moveOne(entry, item, destinationId, destinationPath, destinationDepth));
            }
        }
        for (Item item : normalized) {
            EntryId top = carriedBy.get(item.entryId());
            if (top != null) {
                while (carriedBy.containsKey(top)) {
                    top = carriedBy.get(top);
                }
                Outcome outcome = results.get(top).outcome() == Outcome.MOVED
                        ? Outcome.MOVED_WITH_ANCESTOR
                        : Outcome.ANCESTOR_NOT_MOVED;
                results.put(
                        item.entryId(),
                        new ItemResult(
                                item.entryId(),
                                outcome,
                                entries.get(item.entryId()).revision(),
                                null));
            }
        }
        List<ItemResult> ordered =
                normalized.stream().map(item -> results.get(item.entryId())).toList();
        moveReplays.put(replayKey, new MoveReplay(intent, ordered));
        return ordered;
    }

    private ItemResult moveOne(
            Entry entry, Item item, EntryId destinationId, Set<EntryId> destinationPath, int destinationDepth) {
        EntryId id = entry.id();
        if (entry.parentId() == null) {
            return new ItemResult(id, Outcome.CANNOT_MOVE_ROOT, entry.revision(), null);
        }
        if (entry.parentId().equals(destinationId)) {
            return new ItemResult(id, Outcome.UNCHANGED, entry.revision(), null);
        }
        if (entry.revision() != item.expectedRevision()) {
            return new ItemResult(id, Outcome.REVISION_CONFLICT, entry.revision(), null);
        }
        if (entry instanceof Entry.Folder && destinationPath.contains(id)) {
            return new ItemResult(id, Outcome.DESTINATION_INSIDE_ENTRY, entry.revision(), null);
        }
        if (entry instanceof Entry.Folder && destinationDepth + 1 + height(id) > Entry.MAXIMUM_FOLDER_DEPTH) {
            return new ItemResult(id, Outcome.DEPTH_LIMIT_EXCEEDED, entry.revision(), null);
        }
        if (nameTaken(destinationId, entry.name())) {
            return new ItemResult(id, Outcome.NAME_CONFLICT, entry.revision(), null);
        }
        long revision = entry.revision() + 1;
        Entry moved =
                switch (entry) {
                    case Entry.Folder folder ->
                        new Entry.Folder(
                                id, destinationId, folder.name(), folder.createdAt(), folder.updatedAt(), revision);
                    case Entry.File file ->
                        new Entry.File(
                                id,
                                destinationId,
                                file.name(),
                                file.createdAt(),
                                file.updatedAt(),
                                revision,
                                file.currentVersion(),
                                file.versionCount());
                };
        entries.put(id, moved);
        return new ItemResult(id, Outcome.MOVED, revision, entry.parentId());
    }

    /** Levels of folders below this folder; 0 when it has no subfolders. */
    private int height(EntryId folderId) {
        return entries.values().stream()
                .filter(entry -> entry instanceof Entry.Folder && folderId.equals(entry.parentId()))
                .mapToInt(child -> height(child.id()) + 1)
                .max()
                .orElse(0);
    }

    private boolean nameTaken(EntryId parentId, FileName name) {
        return reservations.contains(new Reservation(parentId, name))
                || entries.values().stream()
                        .anyMatch(entry -> parentId.equals(entry.parentId()) && name.equals(entry.name()));
    }

    private void authorize(CatalogScope scope) {
        if (!WORKSPACE.equals(scope.workspaceId()) || !PRINCIPAL.equals(scope.principalId())) {
            throw new CatalogFailure(ENTRY_NOT_FOUND, "Entry was not found");
        }
    }

    private Entry.Folder folder(CatalogScope scope, EntryId id) {
        if (get(scope, id) instanceof Entry.Folder folder) {
            return folder;
        }
        throw new CatalogFailure(NOT_A_FOLDER, "Entry is not a folder");
    }
}
