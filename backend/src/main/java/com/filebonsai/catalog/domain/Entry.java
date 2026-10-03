package com.filebonsai.catalog.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.regex.Pattern;

public sealed interface Entry permits Entry.File, Entry.Folder {
    /** The deepest a folder may sit: the root is at depth 0 and each folder one below its parent. */
    int MAXIMUM_FOLDER_DEPTH = 1024;

    EntryId id();

    EntryId parentId();

    FileName name();

    Instant createdAt();

    Instant updatedAt();

    /** Increases whenever the entry's name, parent, trash state or current version changes. */
    long revision();

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
            long revision,
            Version currentVersion,
            int versionCount)
            implements Entry {
        public File {
            validate(id, name, createdAt, updatedAt, revision);
            Objects.requireNonNull(parentId);
            Objects.requireNonNull(currentVersion);
            if (versionCount < 1) {
                throw new IllegalArgumentException("A file has at least its current version");
            }
        }
    }

    record Folder(EntryId id, EntryId parentId, FileName name, Instant createdAt, Instant updatedAt, long revision)
            implements Entry {
        public Folder {
            validate(id, name, createdAt, updatedAt, revision);
        }
    }

    private static void validate(EntryId id, FileName name, Instant created, Instant updated, long revision) {
        Objects.requireNonNull(id);
        Objects.requireNonNull(name);
        Objects.requireNonNull(created);
        Objects.requireNonNull(updated);
        if (updated.isBefore(created)) {
            throw new IllegalArgumentException("updatedAt precedes createdAt");
        }
        if (revision < 1) {
            throw new IllegalArgumentException("A revision starts at 1");
        }
    }
}
