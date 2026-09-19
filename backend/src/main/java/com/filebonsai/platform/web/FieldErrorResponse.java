package com.filebonsai.platform.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;

public record FieldErrorResponse(
        @Schema(requiredMode = REQUIRED) String field,

        @Schema(requiredMode = REQUIRED, description = "Open string code; clients must allow unknown codes")
        String code,

        @Schema(requiredMode = REQUIRED) String message) {}
