package com.filebonsai.catalog.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

public record CurrentVersionResponse(
        @Schema(requiredMode = REQUIRED) UUID id,

        @Schema(
                requiredMode = REQUIRED,
                type = "string",
                pattern = "^(0|[1-9][0-9]{0,18})$",
                maxLength = 19,
                description = "Base-10 byte count, 0 through 9223372036854775807 inclusive. Never a JSON number.",
                example = "9007199254740993")
        String sizeBytes,

        @Schema(
                requiredMode = REQUIRED,
                nullable = true,
                pattern = "^[0-9a-f]{64}$",
                description = "Lowercase hex SHA-256 of the stored bytes, verified when the version was committed. "
                        + "Null only for a version recorded without a digest.")
        String sha256,

        @Schema(
                requiredMode = REQUIRED,
                description = "Operator-chosen name of the storage connection that serves this version's bytes. "
                        + "Never a bucket, endpoint, path or credential.")
        String storageConnectionName) {}
