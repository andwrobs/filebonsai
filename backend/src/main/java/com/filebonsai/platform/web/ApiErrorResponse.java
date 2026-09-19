package com.filebonsai.platform.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record ApiErrorResponse(
        @Schema(
                requiredMode = REQUIRED,
                description =
                        "Open string, not an enum. Known codes are documented per operation. Fall back to status and message for unknown codes.")
        String code,

        @Schema(requiredMode = REQUIRED) String message,
        @Schema(requiredMode = REQUIRED) int status,
        @Schema(requiredMode = REQUIRED) String requestId,

        @Schema(requiredMode = REQUIRED, description = "Empty when no individual field is responsible")
        List<FieldErrorResponse> fieldErrors) {}
