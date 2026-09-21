package com.filebonsai.catalog.support;

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
import com.filebonsai.catalog.application.GetWorkspaceRoot;
import com.filebonsai.catalog.application.ListChildren;
import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.catalog.domain.Entry;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import com.filebonsai.catalog.domain.VersionId;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Demo adapter: synchronized atomic operations, process-local data. No durability or real authentication. */
public final class FixtureCatalog implements GetEntry, GetWorkspaceRoot, ListChildren, CreateFolder {
    public static final UUID WORKSPACE = UUID.fromString("10000000-0000-4000-8000-000000000001");
    public static final UUID PRINCIPAL = UUID.fromString("20000000-0000-4000-8000-000000000001");
    public static final EntryId ROOT = new EntryId(UUID.fromString("00000000-0000-4000-8000-000000000001"));
    public static final EntryId FILE = new EntryId(UUID.fromString("00000000-0000-4000-8000-000000000002"));
    public static final EntryId EMPTY = new EntryId(UUID.fromString("00000000-0000-4000-8000-000000000003"));

    private final Map<EntryId, Entry> entries = new HashMap<>();
    private final Map<ReplayKey, Replay> replays = new HashMap<>();
    private final Set<Reservation> reservations = new HashSet<>();
    private final CatalogCursor cursors;
    private final Clock clock;

    private record ReplayKey(CatalogScope scope, UUID key) {}

    private record Intent(EntryId parent, FileName name) {}

    private record Replay(Intent intent, Entry.Folder result) {}

    private record Reservation(EntryId parent, FileName name) {}

    FixtureCatalog(CatalogCursor cursors, Clock clock) {
        this.cursors = cursors;
        this.clock = clock;
        Instant time = Instant.parse("2026-01-01T00:00:00Z");
        entries.put(ROOT, new Entry.Folder(ROOT, null, new FileName("Library"), time, time));
        entries.put(
                FILE,
                new Entry.File(
                        FILE,
                        ROOT,
                        new FileName("Italy.pdf"),
                        time,
                        time,
                        new Entry.Version(
                                new VersionId(UUID.fromString("30000000-0000-4000-8000-000000000001")),
                                new ByteCount(9007199254740993L))));
        entries.put(EMPTY, new Entry.Folder(EMPTY, ROOT, new FileName("Recipes"), time, time));
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
    public synchronized Entry.Folder get(CatalogScope scope) {
        return (Entry.Folder) get(scope, ROOT);
    }

    @Override
    public synchronized Page list(CatalogScope scope, EntryId folderId, int limit, String cursor) {
        folder(scope, folderId);
        if (limit < 1 || limit > 100) {
            throw new CatalogFailure(VALIDATION_FAILED, "Limit must be between 1 and 100");
        }
        var after = cursor == null ? null : cursors.decode(cursor, scope.workspaceId(), folderId);
        List<Entry> eligible = entries.values().stream()
                .filter(entry -> folderId.equals(entry.parentId()))
                .filter(entry -> after == null
                        || compare(entry.name().value(), entry.id().value(), after.name(), after.id()) > 0)
                .sorted((left, right) -> compare(
                        left.name().value(),
                        left.id().value(),
                        right.name().value(),
                        right.id().value()))
                .limit(limit + 1L)
                .toList();
        List<Entry> page = eligible.subList(0, Math.min(limit, eligible.size()));
        String next = null;
        if (eligible.size() > limit) {
            Entry last = page.getLast();
            next = cursors.encode(scope.workspaceId(), folderId, last.name().value(), last.id());
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
        boolean duplicate = entries.values().stream()
                .anyMatch(entry -> parentId.equals(entry.parentId()) && name.equals(entry.name()));
        if (duplicate || reservations.contains(new Reservation(parentId, name))) {
            throw new CatalogFailure(NAME_CONFLICT, "A sibling entry or pending upload already reserves this name");
        }
        Instant now = clock.instant();
        var created = new Entry.Folder(new EntryId(UUID.randomUUID()), parentId, name, now, now);
        entries.put(created.id(), created);
        replays.put(replayKey, new Replay(intent, created));
        return created;
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

    /** Matches PostgreSQL bytewise UTF-8 C collation; UUID ties use canonical text order. */
    private static int compare(String left, UUID leftId, String right, UUID rightId) {
        int result =
                Arrays.compareUnsigned(left.getBytes(StandardCharsets.UTF_8), right.getBytes(StandardCharsets.UTF_8));
        return result == 0 ? leftId.toString().compareTo(rightId.toString()) : result;
    }
}
