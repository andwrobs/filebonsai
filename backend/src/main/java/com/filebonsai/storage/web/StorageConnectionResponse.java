package com.filebonsai.storage.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.filebonsai.storage.application.StorageConnection;
import io.swagger.v3.oas.annotations.media.Schema;

public record StorageConnectionResponse(
        @Schema(
                requiredMode = REQUIRED,
                maxLength = 80,
                description = "Operator-chosen name, or the provider's default. Never a bucket, account, endpoint, or "
                        + "path.")
        String displayName,

        @Schema(
                requiredMode = REQUIRED,
                example = "local",
                description = "Open vocabulary; known values are local and r2. Clients must show an unknown value "
                        + "rather than fail.")
        String providerKind) {
    static StorageConnectionResponse from(StorageConnection connection) {
        return new StorageConnectionResponse(connection.displayName(), connection.providerKind());
    }
}
