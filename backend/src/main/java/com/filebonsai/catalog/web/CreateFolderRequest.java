package com.filebonsai.catalog.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record CreateFolderRequest(
        @NotNull
        @Schema(requiredMode = REQUIRED, description = "Explicit containing folder ID, including for root children")
        UUID parentId,

        @NotNull
        @Schema(
                requiredMode = REQUIRED,
                description =
                        "NFC normalized before comparison. Case-sensitive, no trimming. 1–255 normalized UTF-8 bytes; excludes dot names, separators and controls.")
        String name) {}
