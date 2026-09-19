package com.filebonsai.catalog.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record EntryPageResponse(
        @Schema(requiredMode = REQUIRED) List<EntryResponse> entries,

        @Schema(
                requiredMode = REQUIRED,
                nullable = true,
                description = "Opaque continuation token; null means end of this traversal")
        String nextCursor) {}
