package com.filebonsai.storage.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.filebonsai.storage.application.StorageCapabilities;
import io.swagger.v3.oas.annotations.media.Schema;

public record StorageCapabilitiesResponse(
        @Schema(
                requiredMode = REQUIRED,
                description = "True means every upload's size and SHA-256 are verified before the file becomes "
                        + "available.")
        boolean sha256Verification,

        @Schema(
                requiredMode = REQUIRED,
                description = "False means an interrupted upload is sent again from byte zero.")
        boolean resumableUploads,

        @Schema(requiredMode = REQUIRED, description = "False means downloads always send the whole original.")
        boolean rangeDownloads) {
    static StorageCapabilitiesResponse from(StorageCapabilities capabilities) {
        return new StorageCapabilitiesResponse(
                capabilities.sha256Verification(), capabilities.resumableUploads(), capabilities.rangeDownloads());
    }
}
