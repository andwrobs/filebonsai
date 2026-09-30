package com.filebonsai.catalog.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

public record FolderAncestorResponse(
        @Schema(requiredMode = REQUIRED) UUID id,

        @Schema(requiredMode = REQUIRED, description = "NFC normalized folder name")
        String name) {}
