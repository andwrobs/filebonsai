package com.filebonsai.access;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AccessLoginRequest(
        @Schema(
                requiredMode = REQUIRED,
                writeOnly = true,
                minLength = 1,
                maxLength = 1024,
                pattern = "^[\\s\\S]*\\S[\\s\\S]*$",
                description = "Contains at least one non-whitespace character")
        @NotBlank
        @Size(min = 1, max = 1024)
        String password) {}
