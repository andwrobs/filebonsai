package com.filebonsai.access;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;

public record AccessCsrfResponse(
        @Schema(requiredMode = REQUIRED) String token,

        @Schema(requiredMode = REQUIRED, example = LocalOwnerAccess.CSRF_HEADER)
        String headerName) {}
