package com.filebonsai.catalog.domain;

import java.util.Objects;
import java.util.UUID;

public record EntryId(UUID value) {
    public EntryId {
        Objects.requireNonNull(value);
    }
}
