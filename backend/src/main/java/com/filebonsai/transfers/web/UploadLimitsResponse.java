package com.filebonsai.transfers.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.filebonsai.transfers.application.UploadLimits;
import io.swagger.v3.oas.annotations.media.Schema;

public record UploadLimitsResponse(
        @Schema(
                requiredMode = REQUIRED,
                type = "string",
                pattern = "^(0|[1-9][0-9]*)$",
                description = "Largest accepted file size as an exact decimal byte count. Clients may reject larger "
                        + "files before beginning an upload; the server still enforces the limit.")
        String maximumBytes) {
    static UploadLimitsResponse from(UploadLimits limits) {
        return new UploadLimitsResponse(limits.maximumBytes().decimal());
    }
}
