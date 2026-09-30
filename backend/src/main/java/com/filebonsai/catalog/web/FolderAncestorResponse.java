package com.filebonsai.catalog.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

@Schema(description = "A folder above the requested folder")
public record FolderAncestorResponse(
        @Schema(requiredMode = REQUIRED) UUID id,

        @Schema(requiredMode = REQUIRED, description = "NFC normalized; case preserved; maximum 255 UTF-8 bytes")
        String name) {}
