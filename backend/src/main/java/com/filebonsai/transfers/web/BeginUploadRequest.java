package com.filebonsai.transfers.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record BeginUploadRequest(
        @NotNull @Schema(requiredMode = REQUIRED) UUID parentId,

        @NotNull @Schema(requiredMode = REQUIRED, description = "Logical filename; never used as a storage path")
        String name,

        @NotNull
        @Schema(
                requiredMode = REQUIRED,
                type = "string",
                pattern = "0|[1-9][0-9]*",
                description = "Exact decimal byte count, up to the configured upload limit")
        String sizeBytes,

        @Schema(
                nullable = true,
                pattern = "^[0-9a-fA-F]{64}$",
                description = "Optional expected SHA-256 as 64 hexadecimal characters")
        String sha256) {}
