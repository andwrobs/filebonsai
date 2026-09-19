package com.filebonsai.catalog.domain;

import java.time.Instant;
import java.util.Objects;

public sealed interface Entry permits Entry.File, Entry.Folder {
    EntryId id();

    EntryId parentId();

    FileName name();

    Instant createdAt();

    Instant updatedAt();

    record Version(VersionId id, ByteCount sizeBytes) {
        public Version {
            Objects.requireNonNull(id);
            Objects.requireNonNull(sizeBytes);
        }
    }

    record File(
            EntryId id, EntryId parentId, FileName name, Instant createdAt, Instant updatedAt, Version currentVersion)
            implements Entry {
        public File {
            validate(id, name, createdAt, updatedAt);
            Objects.requireNonNull(parentId);
            Objects.requireNonNull(currentVersion);
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
