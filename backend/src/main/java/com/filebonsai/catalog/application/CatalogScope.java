package com.filebonsai.catalog.application;

import java.util.Objects;
import java.util.UUID;

/** Supplied by trusted authentication, never a request body or arbitrary header. */
public record CatalogScope(UUID principalId, UUID workspaceId) {
    public CatalogScope {
        Objects.requireNonNull(principalId);
        Objects.requireNonNull(workspaceId);
    }
}
