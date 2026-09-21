package com.filebonsai.transfers.web;

import com.filebonsai.catalog.application.CatalogScopeProvider;
import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import com.filebonsai.platform.web.ApiErrorResponse;
import com.filebonsai.platform.web.InvalidField;
import com.filebonsai.transfers.application.BeginUpload;
import com.filebonsai.transfers.application.CancelUpload;
import com.filebonsai.transfers.application.CompleteUpload;
import com.filebonsai.transfers.application.GetUpload;
import com.filebonsai.transfers.application.ReceiveUpload;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.io.IOException;
import java.net.URI;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("postgres")
@RequestMapping("/api/v1")
@Tag(name = "Transfers")
@ApiResponses({
    @ApiResponse(
            responseCode = "400",
            description = "INVALID_REQUEST or VALIDATION_FAILED",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
    @ApiResponse(
            responseCode = "401",
            description = "AUTH_REQUIRED",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
    @ApiResponse(
            responseCode = "403",
            description = "CSRF_INVALID for state-changing requests",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
    @ApiResponse(
            responseCode = "404",
            description = "UPLOAD_NOT_FOUND or ENTRY_NOT_FOUND, including inaccessible resources",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
    @ApiResponse(
            responseCode = "409",
            description = "State, name, idempotency, size, or digest conflict",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
    @ApiResponse(
            responseCode = "410",
            description = "EXPIRED",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
    @ApiResponse(
            responseCode = "413",
            description = "TOO_LARGE",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
    @ApiResponse(
            responseCode = "503",
            description = "STORAGE_UNAVAILABLE",
            headers = @Header(name = HttpHeaders.RETRY_AFTER, schema = @Schema(type = "integer")),
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
})
public class TransferController {
    private final BeginUpload beginUpload;
    private final GetUpload getUpload;
    private final ReceiveUpload receiveUpload;
    private final CompleteUpload completeUpload;
    private final CancelUpload cancelUpload;
    private final CatalogScopeProvider scopes;

    public TransferController(
            BeginUpload beginUpload,
            GetUpload getUpload,
            ReceiveUpload receiveUpload,
            CompleteUpload completeUpload,
            CancelUpload cancelUpload,
            CatalogScopeProvider scopes) {
        this.beginUpload = beginUpload;
        this.getUpload = getUpload;
        this.receiveUpload = receiveUpload;
        this.completeUpload = completeUpload;
        this.cancelUpload = cancelUpload;
        this.scopes = scopes;
    }

    @PostMapping(
            value = "/uploads",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "beginUpload",
            summary = "Reserve a new file upload",
            description = "The Idempotency-Key UUID is scoped to the authenticated workspace and principal.")
    @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true, schema = @Schema(type = "string"))
    @ApiResponse(
            responseCode = "201",
            description = "Created or replayed durable upload intent",
            headers = @Header(name = HttpHeaders.LOCATION, schema = @Schema(type = "string")),
            content = @Content(schema = @Schema(implementation = UploadResponse.class)))
    public ResponseEntity<UploadResponse> begin(
            @RequestHeader("Idempotency-Key") UUID idempotencyKey, @Valid @RequestBody BeginUploadRequest request) {
        FileName name;
        try {
            name = new FileName(request.name());
        } catch (IllegalArgumentException exception) {
            throw new InvalidField("name", "INVALID_NAME", exception.getMessage());
        }
        ByteCount size = size(request.sizeBytes());
        byte[] expectedDigest = digest(request.sha256());
        UploadResponse response = UploadResponse.from(beginUpload.begin(
                scopes.current(), new EntryId(request.parentId()), name, size, expectedDigest, idempotencyKey));
        return ResponseEntity.created(URI.create("/api/v1/uploads/" + response.id()))
                .body(response);
    }

    @GetMapping(value = "/uploads/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "getUpload", summary = "Read durable upload state")
    @ApiResponse(
            responseCode = "200",
            description = "Durable upload state",
            content = @Content(schema = @Schema(implementation = UploadResponse.class)))
    public UploadResponse get(@PathVariable UUID id) {
        return UploadResponse.from(getUpload.get(scopes.current(), id));
    }

    @PutMapping(
            value = "/uploads/{id}/content",
            consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "putUploadContent",
            summary = "Stream a whole upload body",
            description = "Every retry sends the complete body again from byte zero.")
    @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true, schema = @Schema(type = "string"))
    @io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_OCTET_STREAM_VALUE,
                            schema = @Schema(type = "string", format = "binary")))
    @ApiResponse(
            responseCode = "200",
            description = "Verified staged upload state",
            content = @Content(schema = @Schema(implementation = UploadResponse.class)))
    public UploadResponse content(@PathVariable UUID id, HttpServletRequest request) throws IOException {
        return UploadResponse.from(receiveUpload.receive(scopes.current(), id, request.getInputStream()));
    }

    @PostMapping(value = "/uploads/{id}/complete", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "completeUpload", summary = "Publish verified staged bytes")
    @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true, schema = @Schema(type = "string"))
    @ApiResponse(
            responseCode = "200",
            description = "Available or reconciling upload state",
            content = @Content(schema = @Schema(implementation = UploadResponse.class)))
    public UploadResponse complete(@PathVariable UUID id) {
        return UploadResponse.from(completeUpload.complete(scopes.current(), id));
    }

    @DeleteMapping(value = "/uploads/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "cancelUpload", summary = "Cancel before finalization starts")
    @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true, schema = @Schema(type = "string"))
    @ApiResponse(
            responseCode = "200",
            description = "Cancelled upload state",
            content = @Content(schema = @Schema(implementation = UploadResponse.class)))
    public UploadResponse cancel(@PathVariable UUID id) {
        return UploadResponse.from(cancelUpload.cancel(scopes.current(), id));
    }

    private ByteCount size(String value) {
        if (value == null || !value.matches("0|[1-9][0-9]*")) {
            throw new InvalidField("sizeBytes", "INVALID_BYTE_COUNT", "Size must be a nonnegative decimal integer");
        }
        try {
            return new ByteCount(Long.parseLong(value));
        } catch (IllegalArgumentException exception) {
            throw new InvalidField("sizeBytes", "INVALID_BYTE_COUNT", "Size exceeds the supported integer range");
        }
    }

    private byte[] digest(String value) {
        if (value == null) {
            return null;
        }
        if (!value.matches("[0-9a-fA-F]{64}")) {
            throw new InvalidField("sha256", "INVALID_DIGEST", "SHA-256 must contain 64 hexadecimal characters");
        }
        return HexFormat.of().parseHex(value);
    }
}
