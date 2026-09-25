package com.filebonsai.storage.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.storage.application.StorageCapabilities;
import com.filebonsai.storage.application.StorageConnection;
import io.swagger.v3.oas.annotations.media.Schema;

public record StorageSummaryResponse(
        @Schema(requiredMode = REQUIRED) StorageConnectionResponse connection,
        @Schema(requiredMode = REQUIRED) StorageCapabilitiesResponse capabilities,

        @Schema(
                requiredMode = REQUIRED,
                type = "string",
                pattern = "^(0|[1-9][0-9]*)$",
                description = "Exact decimal sum of committed file versions in this workspace. Uploads that are not "
                        + "yet available are excluded.")
        String usedBytes) {
    static StorageSummaryResponse from(
            StorageConnection connection, StorageCapabilities capabilities, ByteCount usedBytes) {
        return new StorageSummaryResponse(
                StorageConnectionResponse.from(connection),
                StorageCapabilitiesResponse.from(capabilities),
                usedBytes.decimal());
    }
}
