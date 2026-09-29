package com.filebonsai.catalog.application;

import com.filebonsai.catalog.domain.Entry;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Objects;
import java.util.UUID;

/**
 * A total order over one folder's children. Each order compares its key, then NFC name bytes, then canonical UUID
 * text, and descending reverses all three. Folders first keeps folders ahead of files in either direction.
 */
public record ListOrder(Key key, boolean descending, boolean foldersFirst) {
    public static final ListOrder DEFAULT = new ListOrder(Key.NAME, false, false);

    /** Size sorts a folder as {@code -1}, below any file. */
    public static final long FOLDER_SIZE = -1;

    public enum Key {
        NAME,
        UPDATED_AT,
        SIZE
    }

    /** Where an entry falls in an order: its kind, the key before the name (null for name), name and ID. */
    public record Position(boolean folder, Long key, String name, UUID id) {
        public Position {
            Objects.requireNonNull(name);
            Objects.requireNonNull(id);
        }
    }

    public ListOrder {
        Objects.requireNonNull(key);
    }

    public Position position(Entry entry) {
        Long value =
                switch (key) {
                    case NAME -> null;
                    case UPDATED_AT -> epochMicros(entry.updatedAt());
                    case SIZE ->
                        entry instanceof Entry.File file
                                ? file.currentVersion().sizeBytes().value()
                                : FOLDER_SIZE;
                };
        return new Position(
                entry instanceof Entry.Folder,
                value,
                entry.name().value(),
                entry.id().value());
    }

    public Comparator<Position> comparator() {
        Comparator<Position> keyed = (left, right) -> {
            int result = key == Key.NAME ? 0 : Long.compare(left.key(), right.key());
            if (result == 0) {
                result = Arrays.compareUnsigned(
                        left.name().getBytes(StandardCharsets.UTF_8),
                        right.name().getBytes(StandardCharsets.UTF_8));
            }
            return result == 0 ? left.id().toString().compareTo(right.id().toString()) : result;
        };
        if (descending) {
            keyed = keyed.reversed();
        }
        return foldersFirst
                ? Comparator.comparing((Position position) -> !position.folder())
                        .thenComparing(keyed)
                : keyed;
    }

    /** Cursor identity. The default order keeps the value issued before other orders existed. */
    String token() {
        String keys =
                switch (key) {
                    case NAME -> "name-id-utf8";
                    case UPDATED_AT -> "updated-name-id-utf8";
                    case SIZE -> "size-name-id-utf8";
                };
        return (foldersFirst ? "folders-first-" : "") + keys + (descending ? "-desc" : "-asc") + "-v1";
    }

    /** PostgreSQL keeps microseconds, so the key and its comparisons stay exact. */
    public static long epochMicros(Instant instant) {
        return Math.addExact(Math.multiplyExact(instant.getEpochSecond(), 1_000_000L), instant.getNano() / 1_000);
    }

    public static Instant fromEpochMicros(long micros) {
        return Instant.EPOCH.plus(micros, ChronoUnit.MICROS);
    }
}
