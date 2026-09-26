package com.filebonsai.storage.web;

import com.filebonsai.catalog.application.CatalogScopeProvider;
import com.filebonsai.catalog.application.GetCommittedBytes;
import com.filebonsai.platform.web.ApiErrorResponse;
import com.filebonsai.storage.application.StorageCapabilities;
import com.filebonsai.storage.application.StorageConnection;
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

@RestController
@Profile("postgres")
@RequestMapping("/api/v1")
@Tag(name = "Storage")
public class StorageController {
    private final StorageConnection connection;
    private final StorageCapabilities capabilities;
    private final GetCommittedBytes committedBytes;
    private final CatalogScopeProvider scopes;

    public StorageController(
            StorageConnection connection,
            StorageCapabilities capabilities,
            GetCommittedBytes committedBytes,
            CatalogScopeProvider scopes) {
        this.connection = connection;
        this.capabilities = capabilities;
        this.committedBytes = committedBytes;
        this.scopes = scopes;
    }

    @GetMapping(value = "/storage", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getStorageSummary",
            summary = "Read the configured storage connection",
            description = "Read-only. Reports configuration and committed usage; it does not probe the provider. "
                    + "Upload size limits come from getUploadLimits.")
    @ApiResponse(
            responseCode = "200",
            description = "Configured connection, capabilities, and committed usage",
            content = @Content(schema = @Schema(implementation = StorageSummaryResponse.class)))
    @ApiResponse(
            responseCode = "401",
            description = "AUTH_REQUIRED",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    @ApiResponse(
            responseCode = "500",
            description = "INTERNAL_ERROR",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    public StorageSummaryResponse summary() {
        return StorageSummaryResponse.from(connection, capabilities, committedBytes.committedBytes(scopes.current()));
    }
}
