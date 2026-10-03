package com.filebonsai.catalog.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

public record FolderEntryResponse(
        @Schema(requiredMode = REQUIRED) Kind kind,
        @Schema(requiredMode = REQUIRED) UUID id,

        @Schema(requiredMode = REQUIRED, nullable = true, description = "Null only for the workspace root")
        UUID parentId,

        @Schema(requiredMode = REQUIRED, description = "NFC normalized; case preserved; maximum 255 UTF-8 bytes")
        String name,

        @Schema(requiredMode = REQUIRED) Instant createdAt,
        @Schema(requiredMode = REQUIRED) Instant updatedAt,

        @Schema(
                requiredMode = REQUIRED,
                minimum = "1",
                description =
                        "Changes with the name, parent, trash state or current version; send it back as expectedRevision")
        long revision)
        implements EntryResponse {
    public enum Kind {
        folder
    }
}
