package com.filebonsai.transfers.web;

import com.filebonsai.catalog.application.CatalogScopeProvider;
import com.filebonsai.platform.web.ApiErrorResponse;
import com.filebonsai.transfers.application.GetUploadLimits;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Kept apart from TransferController so this read does not inherit upload-session failure responses. */
@RestController
@Profile("postgres")
@RequestMapping("/api/v1")
@Tag(name = "Transfers")
public class UploadLimitsController {
    private final GetUploadLimits getUploadLimits;
    private final CatalogScopeProvider scopes;

    public UploadLimitsController(GetUploadLimits getUploadLimits, CatalogScopeProvider scopes) {
        this.getUploadLimits = getUploadLimits;
        this.scopes = scopes;
    }

    @GetMapping(value = "/upload-limits", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getUploadLimits",
            summary = "Read effective upload limits",
            description = "Lets clients reject oversized files before beginUpload. The server remains authoritative "
                    + "and still returns 413 TOO_LARGE for any upload above the limit.")
    @ApiResponse(
            responseCode = "200",
            description = "Effective upload limits",
            content = @Content(schema = @Schema(implementation = UploadLimitsResponse.class)))
    @ApiResponse(
            responseCode = "401",
            description = "AUTH_REQUIRED",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    @ApiResponse(
            responseCode = "500",
            description = "INTERNAL_ERROR",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    public UploadLimitsResponse limits() {
        return UploadLimitsResponse.from(getUploadLimits.limits(scopes.current()));
    }
}
