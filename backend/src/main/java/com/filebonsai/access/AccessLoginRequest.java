package com.filebonsai.access;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AccessLoginRequest(
        @Schema(requiredMode = REQUIRED, writeOnly = true) @NotBlank @Size(max = 1024)
        String password) {}
