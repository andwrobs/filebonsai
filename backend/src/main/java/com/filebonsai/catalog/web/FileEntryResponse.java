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

        @Schema(
                requiredMode = REQUIRED,
                example = "pdf",
                description =
                        "Open vocabulary guessed from the name's extension (ASCII case-insensitive, after the last "
                                + "dot unless it leads the name); known values are archive, audio, code, document, image, pdf, "
                                + "presentation, spreadsheet, text, video and file (unknown extension). The name is metadata, so "
                                + "this is a hint about content, not a check. Clients must show an unknown value rather than fail.")
        String family,

        @Schema(requiredMode = REQUIRED) Instant createdAt,
        @Schema(requiredMode = REQUIRED) Instant updatedAt,
        @Schema(requiredMode = REQUIRED) CurrentVersionResponse currentVersion,

        @Schema(
                requiredMode = REQUIRED,
                minimum = "1",
                description = "Committed versions of this file, the current one included")
        int versionCount)
        implements EntryResponse, EntryDetailsResponse {
    public enum Kind {
        file
    }
}
