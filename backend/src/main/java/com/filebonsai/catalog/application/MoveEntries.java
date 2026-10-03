package com.filebonsai.catalog.application;

import com.filebonsai.catalog.domain.EntryId;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Moves entries into a folder, reporting each item (decision 0012). Items are evaluated in entry-ID order; an item
 * inside another selected folder follows that folder. A replay of the key returns the stored result.
 */
public interface MoveEntries {
    int MAXIMUM_ITEMS = 1000;

    /** Canonical UUID text order, which is also PostgreSQL's uuid order; {@code UUID.compareTo} is signed. */
    Comparator<Item> ENTRY_ID_ORDER =
            Comparator.comparing(item -> item.entryId().value().toString());

    record Item(EntryId entryId, long expectedRevision) {
        public Item {
            Objects.requireNonNull(entryId);
        }
    }

    enum Outcome {
        MOVED,
        MOVED_WITH_ANCESTOR,
        UNCHANGED,
        ANCESTOR_NOT_MOVED,
        NOT_FOUND,
        REVISION_CONFLICT,
        NAME_CONFLICT,
        CANNOT_MOVE_ROOT,
        DESTINATION_INSIDE_ENTRY,
        DEPTH_LIMIT_EXCEEDED
    }

    /**
     * {@code revision} is the entry's revision after the request, null when it was not found. {@code previousParentId}
     * is set only for {@link Outcome#MOVED}.
     */
    record ItemResult(EntryId entryId, Outcome outcome, Long revision, EntryId previousParentId) {
        public ItemResult {
            Objects.requireNonNull(entryId);
            Objects.requireNonNull(outcome);
            if ((outcome == Outcome.NOT_FOUND) != (revision == null)) {
                throw new IllegalArgumentException("Only a missing entry has no revision");
            }
            if ((outcome == Outcome.MOVED) != (previousParentId != null)) {
                throw new IllegalArgumentException("Only a moved entry has a previous parent");
            }
        }
    }

    /** Results in ascending entry-ID order, one per requested item. */
    List<ItemResult> move(CatalogScope scope, EntryId destinationId, List<Item> items, UUID idempotencyKey);

    /** Request shape rules shared by every adapter; the controller reports them as field errors first. */
    static List<Item> normalized(List<Item> items) {
        if (items.isEmpty() || items.size() > MAXIMUM_ITEMS) {
            throw new CatalogFailure(
                    CatalogFailure.Reason.VALIDATION_FAILED, "A move names between 1 and 1000 entries");
        }
        var sorted = items.stream().sorted(ENTRY_ID_ORDER).toList();
        for (int index = 1; index < sorted.size(); index++) {
            if (sorted.get(index).entryId().equals(sorted.get(index - 1).entryId())) {
                throw new CatalogFailure(CatalogFailure.Reason.VALIDATION_FAILED, "A move names each entry once");
            }
        }
        if (sorted.stream().anyMatch(item -> item.expectedRevision() < 1)) {
            throw new CatalogFailure(CatalogFailure.Reason.VALIDATION_FAILED, "Revisions start at 1");
        }
        return sorted;
    }
}
