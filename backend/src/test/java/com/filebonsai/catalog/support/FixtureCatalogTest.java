package com.filebonsai.catalog.support;

import static com.filebonsai.catalog.support.FixtureCatalog.EMPTY;
import static com.filebonsai.catalog.support.FixtureCatalog.FILE;
import static com.filebonsai.catalog.support.FixtureCatalog.PRINCIPAL;
import static com.filebonsai.catalog.support.FixtureCatalog.ROOT;
import static com.filebonsai.catalog.support.FixtureCatalog.WORKSPACE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.filebonsai.catalog.application.CatalogCursor;
import com.filebonsai.catalog.application.CatalogFailure;
import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.application.ListChildren;
import com.filebonsai.catalog.application.ListOrder;
import com.filebonsai.catalog.application.MoveEntries;
import com.filebonsai.catalog.application.MoveEntries.ItemResult;
import com.filebonsai.catalog.application.MoveEntries.Outcome;
import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.catalog.domain.Entry;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class FixtureCatalogTest {
    private final CatalogScope scope = new CatalogScope(PRINCIPAL, WORKSPACE);
    private FixtureCatalog catalog;

    @BeforeEach
    void setup() {
        catalog = new FixtureCatalog(
                new CatalogCursor(new ObjectMapper(), new byte[32]),
                Clock.fixed(Instant.parse("2026-02-01T00:00:00Z"), ZoneOffset.UTC));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", ".", "..", "a/b", "a\\b", "a\nb", "a\u0000b", "a\u0085b", "\uD800"})
    void rejectsInvalidNames(String name) {
        assertThatThrownBy(() -> new FileName(name)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void normalizesNamesAndEnforcesTheUtf8ByteBoundary() {
        assertThat(new FileName("Cafe\u0301")).isEqualTo(new FileName("Café"));
        assertThat(new FileName(" Space ").value()).isEqualTo(" Space ");
        assertThat(new FileName("é".repeat(127) + "x").value()).hasSize(128);
        assertThatThrownBy(() -> new FileName("é".repeat(128))).isInstanceOf(IllegalArgumentException.class);
        assertThat(new FileName("e\u0301".repeat(127))).isEqualTo(new FileName("é".repeat(127)));
    }

    @Test
    void preservesByteCountPrecisionAndDetectsOverflow() {
        assertThat(new ByteCount(9007199254740993L).decimal()).isEqualTo("9007199254740993");
        assertThat(new ByteCount(Long.MAX_VALUE).decimal()).isEqualTo("9223372036854775807");
        assertThat(new ByteCount(0).decimal()).isEqualTo("0");
        assertThatThrownBy(() -> new ByteCount(-1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ByteCount(Long.MAX_VALUE).plus(new ByteCount(1)))
                .isInstanceOf(ArithmeticException.class);
    }

    @Test
    void treatsNamesAsCaseSensitiveAndNormalizedForConflicts() {
        create(ROOT, "Café");
        create(ROOT, "café");
        assertReason(() -> create(ROOT, "Cafe\u0301"), CatalogFailure.Reason.NAME_CONFLICT);
        assertReason(() -> create(ROOT, "Italy.pdf"), CatalogFailure.Reason.NAME_CONFLICT);
        assertReason(() -> create(ROOT, "pending-upload.bin"), CatalogFailure.Reason.NAME_CONFLICT);
    }

    @Test
    void scopesIdempotencyToNormalizedIntent() {
        UUID key = UUID.randomUUID();
        var first = catalog.create(scope, ROOT, new FileName("Cafe\u0301"), key);
        assertThat(catalog.create(scope, ROOT, new FileName("Café"), key)).isEqualTo(first);
        assertReason(
                () -> catalog.create(scope, ROOT, new FileName("Different"), key),
                CatalogFailure.Reason.IDEMPOTENCY_CONFLICT);
        assertReason(
                () -> catalog.create(scope, EMPTY, new FileName("Café"), key),
                CatalogFailure.Reason.IDEMPOTENCY_CONFLICT);
    }

    @Test
    void concurrentRequestsWithTheSameKeyReturnOneIdentity() throws Exception {
        UUID key = UUID.randomUUID();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var jobs = new ArrayList<Callable<Entry.Folder>>();
            for (int index = 0; index < 20; index++) {
                jobs.add(() -> catalog.create(scope, ROOT, new FileName("Concurrent"), key));
            }
            var results = executor.invokeAll(jobs);
            Set<EntryId> ids = new HashSet<>();
            for (var result : results) {
                ids.add(result.get().id());
            }
            assertThat(ids).hasSize(1);
        }
    }

    @Test
    void concurrentRequestsWithDifferentKeysCompeteForTheName() throws Exception {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var jobs = new ArrayList<Callable<Boolean>>();
            for (int index = 0; index < 20; index++) {
                jobs.add(() -> {
                    try {
                        create(ROOT, "Race");
                        return true;
                    } catch (CatalogFailure exception) {
                        assertThat(exception.reason()).isEqualTo(CatalogFailure.Reason.NAME_CONFLICT);
                        return false;
                    }
                });
            }
            int successes = 0;
            for (var result : executor.invokeAll(jobs)) {
                if (result.get()) {
                    successes++;
                }
            }
            assertThat(successes).isEqualTo(1);
        }
    }

    @Test
    void pagesByUtf8OrderWithoutOffsetShifts() {
        var parent = create(ROOT, "Paging");
        create(parent.id(), "A");
        create(parent.id(), "C");
        create(parent.id(), "\uE000");
        create(parent.id(), "😀");

        var first = catalog.list(scope, parent.id(), ListOrder.DEFAULT, 1, null);
        assertThat(first.entries()).extracting(entry -> entry.name().value()).containsExactly("A");

        create(parent.id(), "0");
        create(parent.id(), "B");
        var rest = catalog.list(scope, parent.id(), ListOrder.DEFAULT, 100, first.nextCursor());
        assertThat(rest.entries()).extracting(entry -> entry.name().value()).containsExactly("B", "C", "\uE000", "😀");
        assertThat(rest.nextCursor()).isNull();
        assertThat(catalog.list(scope, EMPTY, ListOrder.DEFAULT, 5, null).entries())
                .isEmpty();
    }

    @Test
    void ordersEveryPageBySortKeyNameAndIdWithFoldersFirstInEitherDirection() {
        // Root holds the Italy.pdf file and the Recipes folder; the new folders are newer than both.
        create(ROOT, "Alpha");
        create(ROOT, "Zulu");
        assertThat(names(new ListOrder(ListOrder.Key.NAME, false, false)))
                .containsExactly("Alpha", "Italy.pdf", "Recipes", "Zulu");
        assertThat(names(new ListOrder(ListOrder.Key.NAME, true, false)))
                .containsExactly("Zulu", "Recipes", "Italy.pdf", "Alpha");
        assertThat(names(new ListOrder(ListOrder.Key.NAME, true, true)))
                .containsExactly("Zulu", "Recipes", "Alpha", "Italy.pdf");
        assertThat(names(new ListOrder(ListOrder.Key.UPDATED_AT, false, false)))
                .containsExactly("Italy.pdf", "Recipes", "Alpha", "Zulu");
        assertThat(names(new ListOrder(ListOrder.Key.UPDATED_AT, true, true)))
                .containsExactly("Zulu", "Alpha", "Recipes", "Italy.pdf");
        assertThat(names(new ListOrder(ListOrder.Key.SIZE, false, false)))
                .containsExactly("Alpha", "Recipes", "Zulu", "Italy.pdf");
        assertThat(names(new ListOrder(ListOrder.Key.SIZE, true, false)))
                .containsExactly("Italy.pdf", "Zulu", "Recipes", "Alpha");
        assertThat(names(new ListOrder(ListOrder.Key.SIZE, true, true)))
                .containsExactly("Zulu", "Recipes", "Alpha", "Italy.pdf");
    }

    @Test
    void acceptsDefaultOrderCursorsIssuedBeforeOtherOrdersExisted() throws Exception {
        // The pre-sort payload: no kind or key, signed with the fixture's all-zero key.
        byte[] payload = new ObjectMapper()
                .writeValueAsBytes(Map.of(
                        "version",
                        1,
                        "workspaceId",
                        WORKSPACE,
                        "folderId",
                        ROOT.value(),
                        "sort",
                        "name-id-utf8-asc-v1",
                        "name",
                        "Italy.pdf",
                        "id",
                        FILE.value()));
        var mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(new byte[32], "HmacSHA256"));
        var encoder = Base64.getUrlEncoder().withoutPadding();
        String legacy = encoder.encodeToString(payload) + "." + encoder.encodeToString(mac.doFinal(payload));

        assertThat(catalog.list(scope, ROOT, ListOrder.DEFAULT, 10, legacy).entries())
                .extracting(entry -> entry.name().value())
                .containsExactly("Recipes");
        assertReason(
                () -> catalog.list(scope, ROOT, new ListOrder(ListOrder.Key.NAME, false, true), 10, legacy),
                CatalogFailure.Reason.INVALID_CURSOR);
    }

    @Test
    void limitsPagesToOneKindInEveryOrderAndBindsCursorsToTheKind() {
        // Root holds one file (Italy.pdf) and the Recipes folder; add more folders so both groups span pages.
        create(ROOT, "Alpha");
        create(ROOT, "Zulu");
        create(ROOT, "Mike");
        var everyOrder = new ArrayList<ListOrder>();
        for (var key : ListOrder.Key.values()) {
            for (boolean descending : List.of(false, true)) {
                for (boolean foldersFirst : List.of(false, true)) {
                    everyOrder.add(new ListOrder(key, descending, foldersFirst));
                }
            }
        }
        for (var order : everyOrder) {
            for (var kind : ListChildren.Kind.values()) {
                boolean folders = kind == ListChildren.Kind.FOLDER;
                for (int limit : List.of(1, 2)) {
                    var seen = new ArrayList<Entry>();
                    String cursor = null;
                    do {
                        var page = catalog.list(scope, ROOT, order, kind, limit, cursor);
                        seen.addAll(page.entries());
                        cursor = page.nextCursor();
                    } while (cursor != null);
                    var context = order + " " + kind + " limit " + limit;
                    assertThat(seen).as(context).allMatch(entry -> (entry instanceof Entry.Folder) == folders);
                    assertThat(seen)
                            .as(context)
                            .extracting(entry -> entry.name().value())
                            .containsExactlyInAnyOrderElementsOf(
                                    folders ? List.of("Alpha", "Mike", "Recipes", "Zulu") : List.of("Italy.pdf"));
                    for (int index = 1; index < seen.size(); index++) {
                        assertThat(order.comparator()
                                        .compare(order.position(seen.get(index - 1)), order.position(seen.get(index))))
                                .as(context)
                                .isNegative();
                    }
                }
            }
        }
        // A filtered cursor is valid only under the same filter; an unfiltered cursor is invalid under any filter.
        var order = new ListOrder(ListOrder.Key.NAME, false, true);
        String foldersOnly = catalog.list(scope, ROOT, order, ListChildren.Kind.FOLDER, 1, null)
                .nextCursor();
        String unfiltered = catalog.list(scope, ROOT, order, 1, null).nextCursor();
        assertThat(foldersOnly).isNotNull();
        assertThat(unfiltered).isNotNull();
        assertReason(() -> catalog.list(scope, ROOT, order, 1, foldersOnly), CatalogFailure.Reason.INVALID_CURSOR);
        assertReason(
                () -> catalog.list(scope, ROOT, order, ListChildren.Kind.FILE, 1, foldersOnly),
                CatalogFailure.Reason.INVALID_CURSOR);
        assertReason(
                () -> catalog.list(scope, ROOT, order, ListChildren.Kind.FOLDER, 1, unfiltered),
                CatalogFailure.Reason.INVALID_CURSOR);
        assertReason(
                () -> catalog.list(scope, ROOT, order, ListChildren.Kind.FILE, 1, unfiltered),
                CatalogFailure.Reason.INVALID_CURSOR);
    }

    /** Pages one entry at a time so every step crosses a cursor. */
    private List<String> names(ListOrder order) {
        var names = new ArrayList<String>();
        String cursor = null;
        do {
            var page = catalog.list(scope, ROOT, order, 1, cursor);
            page.entries().forEach(entry -> names.add(entry.name().value()));
            cursor = page.nextCursor();
        } while (cursor != null);
        return names;
    }

    @Test
    void preventsCursorTamperingAndScopeReuse() {
        String cursor = catalog.list(scope, ROOT, ListOrder.DEFAULT, 1, null).nextCursor();
        assertThat(cursor).isNotNull();
        assertReason(
                () -> catalog.list(scope, EMPTY, ListOrder.DEFAULT, 1, cursor), CatalogFailure.Reason.INVALID_CURSOR);
        String tampered = (cursor.charAt(0) == 'A' ? "B" : "A") + cursor.substring(1);
        assertReason(
                () -> catalog.list(scope, ROOT, ListOrder.DEFAULT, 1, tampered), CatalogFailure.Reason.INVALID_CURSOR);
        var codec = new CatalogCursor(new ObjectMapper(), new byte[32]);
        assertReason(
                () -> codec.decode(cursor, UUID.randomUUID(), ROOT, ListOrder.DEFAULT, null),
                CatalogFailure.Reason.INVALID_CURSOR);
        for (var other : List.of(
                new ListOrder(ListOrder.Key.NAME, true, false),
                new ListOrder(ListOrder.Key.NAME, false, true),
                new ListOrder(ListOrder.Key.UPDATED_AT, false, false),
                new ListOrder(ListOrder.Key.SIZE, false, false))) {
            assertReason(() -> catalog.list(scope, ROOT, other, 1, cursor), CatalogFailure.Reason.INVALID_CURSOR);
        }
        assertReason(() -> catalog.list(scope, ROOT, ListOrder.DEFAULT, 1, ""), CatalogFailure.Reason.INVALID_CURSOR);
        assertReason(
                () -> catalog.list(scope, ROOT, ListOrder.DEFAULT, 101, null), CatalogFailure.Reason.VALIDATION_FAILED);
    }

    @Test
    void checksScopeForReadsListsAndWrites() {
        var stranger = new CatalogScope(UUID.randomUUID(), WORKSPACE);
        var otherWorkspace = new CatalogScope(PRINCIPAL, UUID.randomUUID());
        assertReason(() -> catalog.get(stranger, ROOT), CatalogFailure.Reason.ENTRY_NOT_FOUND);
        assertReason(
                () -> catalog.list(otherWorkspace, ROOT, ListOrder.DEFAULT, 10, null),
                CatalogFailure.Reason.ENTRY_NOT_FOUND);
        assertReason(
                () -> catalog.create(stranger, ROOT, new FileName("x"), UUID.randomUUID()),
                CatalogFailure.Reason.ENTRY_NOT_FOUND);
        assertReason(() -> catalog.list(scope, FILE, ListOrder.DEFAULT, 10, null), CatalogFailure.Reason.NOT_A_FOLDER);
        assertReason(() -> create(FILE, "x"), CatalogFailure.Reason.NOT_A_FOLDER);
        assertReason(() -> catalog.get(scope, new EntryId(UUID.randomUUID())), CatalogFailure.Reason.ENTRY_NOT_FOUND);
    }

    @Test
    void movesLikeThePostgresqlAdapter() {
        Entry.Folder archive = create(ROOT, "Archive");
        Entry.Folder inside = create(EMPTY, "Inside");
        UUID key = UUID.randomUUID();
        var first = move(archive.id(), key, item(FILE, 1), item(EMPTY, 1), item(inside.id(), 5));

        assertThat(first)
                .containsExactlyInAnyOrder(
                        new ItemResult(FILE, Outcome.MOVED, 2L, ROOT),
                        new ItemResult(EMPTY, Outcome.MOVED, 2L, ROOT),
                        new ItemResult(inside.id(), Outcome.MOVED_WITH_ANCESTOR, 1L, null));
        assertThat(catalog.details(scope, inside.id()).ancestors())
                .extracting(ancestor -> ancestor.id())
                .containsExactly(ROOT, archive.id(), EMPTY);
        assertThat(move(archive.id(), key, item(inside.id(), 5), item(EMPTY, 1), item(FILE, 1)))
                .isEqualTo(first);
        assertThat(move(archive.id(), UUID.randomUUID(), item(ROOT, 1), item(FILE, 2)))
                .containsExactly(
                        new ItemResult(ROOT, Outcome.CANNOT_MOVE_ROOT, 1L, null),
                        new ItemResult(FILE, Outcome.ANCESTOR_NOT_MOVED, 2L, null));
        assertReason(() -> move(archive.id(), key, item(FILE, 2)), CatalogFailure.Reason.IDEMPOTENCY_CONFLICT);
        assertThat(move(inside.id(), UUID.randomUUID(), item(EMPTY, 2)))
                .containsExactly(new ItemResult(EMPTY, Outcome.DESTINATION_INSIDE_ENTRY, 2L, null));
        assertThat(move(ROOT, UUID.randomUUID(), item(FILE, 1)))
                .containsExactly(new ItemResult(FILE, Outcome.REVISION_CONFLICT, 2L, null));
        create(ROOT, "Italy.pdf");
        assertThat(move(ROOT, UUID.randomUUID(), item(FILE, 2)))
                .containsExactly(new ItemResult(FILE, Outcome.NAME_CONFLICT, 2L, null));
        assertReason(() -> move(FILE, UUID.randomUUID(), item(EMPTY, 2)), CatalogFailure.Reason.NOT_A_FOLDER);
        assertReason(() -> move(archive.id(), UUID.randomUUID()), CatalogFailure.Reason.VALIDATION_FAILED);
    }

    @Test
    void limitsFolderDepthWhenCreatingAndMoving() {
        EntryId parent = ROOT;
        for (int depth = 1; depth <= Entry.MAXIMUM_FOLDER_DEPTH; depth++) {
            parent = create(parent, "Level " + depth).id();
        }
        EntryId deepest = parent;
        assertThat(catalog.details(scope, deepest).ancestors()).hasSize(Entry.MAXIMUM_FOLDER_DEPTH);
        assertReason(() -> create(deepest, "Too deep"), CatalogFailure.Reason.DEPTH_LIMIT_EXCEEDED);
        EntryId atDepth1023 = catalog.details(scope, deepest).folder().parentId();
        create(EMPTY, "Child");
        assertThat(move(atDepth1023, UUID.randomUUID(), item(EMPTY, 1)))
                .containsExactly(new ItemResult(EMPTY, Outcome.DEPTH_LIMIT_EXCEEDED, 1L, null));
    }

    private List<ItemResult> move(EntryId destination, UUID key, MoveEntries.Item... items) {
        return catalog.move(scope, destination, List.of(items), key);
    }

    private static MoveEntries.Item item(EntryId id, long expectedRevision) {
        return new MoveEntries.Item(id, expectedRevision);
    }

    private Entry.Folder create(EntryId parent, String name) {
        return catalog.create(scope, parent, new FileName(name), UUID.randomUUID());
    }

    private static void assertReason(Runnable action, CatalogFailure.Reason reason) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(
                        CatalogFailure.class,
                        exception -> assertThat(exception.reason()).isEqualTo(reason));
    }
}
