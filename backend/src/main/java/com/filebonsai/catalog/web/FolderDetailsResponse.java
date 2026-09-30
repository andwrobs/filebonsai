package com.filebonsai.catalog.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A folder read directly by ID. Listing rows use FolderEntryResponse without an ancestor chain. */
public record FolderDetailsResponse(
        @Schema(requiredMode = REQUIRED) Kind kind,
        @Schema(requiredMode = REQUIRED) UUID id,

        @Schema(requiredMode = REQUIRED, nullable = true, description = "Null only for the workspace root")
        UUID parentId,

        @Schema(requiredMode = REQUIRED, description = "NFC normalized; case preserved; maximum 255 UTF-8 bytes")
        String name,

        @Schema(requiredMode = REQUIRED) Instant createdAt,
        @Schema(requiredMode = REQUIRED) Instant updatedAt,

        @Schema(requiredMode = REQUIRED, description = "Root-to-parent order; empty for the workspace root")
        List<FolderAncestorResponse> ancestors)
        implements EntryDetailsResponse {
    public enum Kind {
        folder
    }
}
