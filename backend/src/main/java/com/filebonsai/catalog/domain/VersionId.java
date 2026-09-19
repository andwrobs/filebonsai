package com.filebonsai.catalog.domain;

import java.util.Objects;
import java.util.UUID;

public record VersionId(UUID value) {
    public VersionId {
        Objects.requireNonNull(value);
    }
}
