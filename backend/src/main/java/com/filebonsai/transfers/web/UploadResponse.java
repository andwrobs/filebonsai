package com.filebonsai.transfers.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.filebonsai.transfers.application.UploadSession;
import com.filebonsai.transfers.domain.UploadState;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

public record UploadResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID entryId,
        @Schema(requiredMode = REQUIRED) UUID versionId,
        @Schema(requiredMode = REQUIRED) UUID parentId,
        @Schema(requiredMode = REQUIRED) String name,

        @Schema(requiredMode = REQUIRED, type = "string", pattern = "0|[1-9][0-9]*")
        String sizeBytes,

        @Schema(requiredMode = REQUIRED, nullable = true) String expectedSha256,
        @Schema(requiredMode = REQUIRED, nullable = true) String computedSha256,

        @Schema(
                requiredMode = REQUIRED,
                description = "Versioned closed lifecycle vocabulary; adding a value is a breaking API change.")
        UploadState state,

        @Schema(requiredMode = REQUIRED) Instant expiresAt) {
    static UploadResponse from(UploadSession session) {
        return new UploadResponse(
                session.id(),
                session.entryId().value(),
                session.versionId().value(),
                session.parentId().value(),
                session.name().value(),
                session.expectedSize().decimal(),
                session.expectedSha256(),
                session.computedSha256(),
                session.state(),
                session.expiresAt());
    }
}
