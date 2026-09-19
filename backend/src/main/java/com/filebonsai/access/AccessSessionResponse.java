package com.filebonsai.access;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

public record AccessSessionResponse(
        @Schema(requiredMode = REQUIRED) UUID principalId,
        @Schema(requiredMode = REQUIRED) Instant expiresAt) {}
