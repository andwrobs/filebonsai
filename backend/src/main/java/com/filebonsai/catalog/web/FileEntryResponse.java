package com.filebonsai.catalog.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

public record FileEntryResponse(
        @Schema(requiredMode = REQUIRED) Kind kind,
        @Schema(requiredMode = REQUIRED) UUID id,

        @Schema(requiredMode = REQUIRED, description = "Containing folder identity")
        UUID parentId,

        @Schema(requiredMode = REQUIRED, description = "NFC normalized; case preserved; maximum 255 UTF-8 bytes")
        String name,

        @Schema(requiredMode = REQUIRED) Instant createdAt,
        @Schema(requiredMode = REQUIRED) Instant updatedAt,
        @Schema(requiredMode = REQUIRED) CurrentVersionResponse currentVersion)
        implements EntryResponse {
    public enum Kind {
        file
    }
}
