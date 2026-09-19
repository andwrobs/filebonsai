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
import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.catalog.domain.Entry;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
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

        var first = catalog.list(scope, parent.id(), 1, null);
        assertThat(first.entries()).extracting(entry -> entry.name().value()).containsExactly("A");

        create(parent.id(), "0");
        create(parent.id(), "B");
        var rest = catalog.list(scope, parent.id(), 100, first.nextCursor());
        assertThat(rest.entries()).extracting(entry -> entry.name().value()).containsExactly("B", "C", "\uE000", "😀");
        assertThat(rest.nextCursor()).isNull();
        assertThat(catalog.list(scope, EMPTY, 5, null).entries()).isEmpty();
    }

    @Test
    void preventsCursorTamperingAndScopeReuse() {
        String cursor = catalog.list(scope, ROOT, 1, null).nextCursor();
        assertThat(cursor).isNotNull();
        assertReason(() -> catalog.list(scope, EMPTY, 1, cursor), CatalogFailure.Reason.INVALID_CURSOR);
        String tampered = (cursor.charAt(0) == 'A' ? "B" : "A") + cursor.substring(1);
        assertReason(() -> catalog.list(scope, ROOT, 1, tampered), CatalogFailure.Reason.INVALID_CURSOR);
        var codec = new CatalogCursor(new ObjectMapper(), new byte[32]);
        assertReason(() -> codec.decode(cursor, UUID.randomUUID(), ROOT), CatalogFailure.Reason.INVALID_CURSOR);
        assertReason(() -> catalog.list(scope, ROOT, 1, ""), CatalogFailure.Reason.INVALID_CURSOR);
        assertReason(() -> catalog.list(scope, ROOT, 101, null), CatalogFailure.Reason.VALIDATION_FAILED);
    }

    @Test
    void checksScopeForReadsListsAndWrites() {
        var stranger = new CatalogScope(UUID.randomUUID(), WORKSPACE);
        var otherWorkspace = new CatalogScope(PRINCIPAL, UUID.randomUUID());
        assertReason(() -> catalog.get(stranger, ROOT), CatalogFailure.Reason.ENTRY_NOT_FOUND);
        assertReason(() -> catalog.list(otherWorkspace, ROOT, 10, null), CatalogFailure.Reason.ENTRY_NOT_FOUND);
        assertReason(
                () -> catalog.create(stranger, ROOT, new FileName("x"), UUID.randomUUID()),
                CatalogFailure.Reason.ENTRY_NOT_FOUND);
        assertReason(() -> catalog.list(scope, FILE, 10, null), CatalogFailure.Reason.NOT_A_FOLDER);
        assertReason(() -> create(FILE, "x"), CatalogFailure.Reason.NOT_A_FOLDER);
        assertReason(() -> catalog.get(scope, new EntryId(UUID.randomUUID())), CatalogFailure.Reason.ENTRY_NOT_FOUND);
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
