package com.filebonsai.transfers.web;

import com.filebonsai.catalog.application.CatalogScopeProvider;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.platform.web.ApiErrorResponse;
import com.filebonsai.transfers.application.DownloadOriginal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("postgres")
@RequestMapping("/api/v1")
@Tag(name = "Transfers")
public class DownloadController {
    private final DownloadOriginal downloadOriginal;
    private final CatalogScopeProvider scopes;

    public DownloadController(DownloadOriginal downloadOriginal, CatalogScopeProvider scopes) {
        this.downloadOriginal = downloadOriginal;
        this.scopes = scopes;
    }

    @GetMapping(value = "/entries/{id}/content", produces = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    @Operation(operationId = "downloadOriginal", summary = "Download an authorized available original")
    @ApiResponse(
            responseCode = "200",
            description = "Attachment body",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_OCTET_STREAM_VALUE,
                            schema = @Schema(type = "string", format = "binary")))
    @ApiResponse(
            responseCode = "401",
            description = "AUTH_REQUIRED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorResponse.class)))
    @ApiResponse(
            responseCode = "404",
            description = "ENTRY_NOT_FOUND, including inaccessible resources",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorResponse.class)))
    @ApiResponse(
            responseCode = "503",
            description = "STORAGE_UNAVAILABLE",
            headers = @Header(name = HttpHeaders.RETRY_AFTER, schema = @Schema(type = "integer")),
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorResponse.class)))
    public ResponseEntity<InputStreamResource> download(@PathVariable UUID id) {
        var download = downloadOriginal.open(scopes.current(), new EntryId(id));
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(download.name().value(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(download.size().value())
                .body(new InputStreamResource(download.content()));
    }
}
