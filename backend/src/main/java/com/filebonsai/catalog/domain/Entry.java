package com.filebonsai.catalog.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.regex.Pattern;

public sealed interface Entry permits Entry.File, Entry.Folder {
    EntryId id();

    EntryId parentId();

    FileName name();

    Instant createdAt();

    Instant updatedAt();

    /** {@code sha256} is the stored object's lowercase hex digest, or null for an object recorded without one. */
    record Version(VersionId id, ByteCount sizeBytes, String sha256) {
        private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");

        public Version {
            Objects.requireNonNull(id);
            Objects.requireNonNull(sizeBytes);
            if (sha256 != null && !SHA256.matcher(sha256).matches()) {
                throw new IllegalArgumentException("SHA-256 must be 64 lowercase hexadecimal characters");
            }
        }
    }

    /** {@code versionCount} counts every committed version of the entry, the current one included. */
    record File(
            EntryId id,
            EntryId parentId,
            FileName name,
            Instant createdAt,
            Instant updatedAt,
            Version currentVersion,
            int versionCount)
            implements Entry {
        public File {
            validate(id, name, createdAt, updatedAt);
            Objects.requireNonNull(parentId);
            Objects.requireNonNull(currentVersion);
            if (versionCount < 1) {
                throw new IllegalArgumentException("A file has at least its current version");
            }
        }
    }

    record Folder(EntryId id, EntryId parentId, FileName name, Instant createdAt, Instant updatedAt) implements Entry {
        public Folder {
            validate(id, name, createdAt, updatedAt);
        }
    }

    private static void validate(EntryId id, FileName name, Instant created, Instant updated) {
        Objects.requireNonNull(id);
        Objects.requireNonNull(name);
        Objects.requireNonNull(created);
        Objects.requireNonNull(updated);
        if (updated.isBefore(created)) {
            throw new IllegalArgumentException("updatedAt precedes createdAt");
        }
    }
}
