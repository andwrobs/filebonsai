package com.filebonsai.catalog.web;

import com.filebonsai.catalog.application.CatalogScopeProvider;
import com.filebonsai.catalog.application.CreateFolder;
import com.filebonsai.catalog.application.GetEntry;
import com.filebonsai.catalog.application.GetWorkspaceRoot;
import com.filebonsai.catalog.application.ListChildren;
import com.filebonsai.catalog.application.ListOrder;
import com.filebonsai.catalog.application.StorageConnectionName;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import com.filebonsai.platform.web.ApiErrorResponse;
import com.filebonsai.platform.web.InvalidField;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Catalog")
@ApiResponses({
    @ApiResponse(
            responseCode = "401",
            description = "AUTH_REQUIRED",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED, INVALID_REQUEST, INVALID_CURSOR, or NOT_A_FOLDER",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
    @ApiResponse(
            responseCode = "404",
            description = "ENTRY_NOT_FOUND, including inaccessible entries",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class))),
    @ApiResponse(
            responseCode = "500",
            description = "INTERNAL_ERROR",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
})
public class CatalogController {
    private final GetEntry getEntry;
    private final GetWorkspaceRoot getWorkspaceRoot;
    private final ListChildren listChildren;
    private final CreateFolder createFolder;
    private final CatalogScopeProvider scopes;
    private final StorageConnectionName storage;

    public CatalogController(
            GetEntry getEntry,
            GetWorkspaceRoot getWorkspaceRoot,
            ListChildren listChildren,
            CreateFolder createFolder,
            CatalogScopeProvider scopes,
            StorageConnectionName storage) {
        this.getEntry = getEntry;
        this.getWorkspaceRoot = getWorkspaceRoot;
        this.listChildren = listChildren;
        this.createFolder = createFolder;
        this.scopes = scopes;
        this.storage = storage;
    }

    @GetMapping(value = "/catalog/root", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "getWorkspaceRoot", summary = "Read the authenticated workspace root folder")
    @ApiResponse(
            responseCode = "200",
            description = "Workspace root folder",
            content = @Content(schema = @Schema(implementation = FolderEntryResponse.class)))
    public FolderEntryResponse getWorkspaceRoot() {
        return CatalogResponseMapper.response(getWorkspaceRoot.get(scopes.current()));
    }

    @GetMapping(value = "/entries/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "getEntry", summary = "Read an available file or folder")
    @ApiResponse(
            responseCode = "200",
            description = "Entry",
            content = @Content(schema = @Schema(implementation = EntryResponse.class)))
    public EntryResponse getEntry(@PathVariable UUID id) {
        return CatalogResponseMapper.response(getEntry.get(scopes.current(), new EntryId(id)), storage);
    }

    @GetMapping(value = "/entries/{id}/children", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listChildren",
            summary = "List direct children",
            description =
                    "Ordered by `sort`, then NFC name in UTF-8 byte order, then ID; `desc` reverses all three. `foldersFirst` keeps folders ahead of files in either direction. `updatedAt` is the entry's `updatedAt`. `size` is the current version's `sizeBytes`, and a folder sorts below any file. No snapshot: inserts or changes behind the cursor may be missed, and changes ahead may repeat an entry. Deduplicate by ID or refresh when needed. Tokens are opaque, scoped to the workspace/folder/sort/order/foldersFirst, and invalid after cursor-key rotation; fixture restart rotates its key.")
    @ApiResponse(
            responseCode = "200",
            description = "Page",
            content = @Content(schema = @Schema(implementation = EntryPageResponse.class)))
    public EntryPageResponse listChildren(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "50") @Min(1) @Max(100) int limit,
            @RequestParam(required = false) @Size(max = 2048) String cursor,
            @Parameter(
                            schema =
                                    @Schema(
                                            allowableValues = {"name", "updatedAt", "size"},
                                            defaultValue = "name"))
                    @RequestParam(defaultValue = "name")
                    String sort,
            @Parameter(
                            schema =
                                    @Schema(
                                            allowableValues = {"asc", "desc"},
                                            defaultValue = "asc"))
                    @RequestParam(defaultValue = "asc")
                    String order,
            @RequestParam(defaultValue = "false") boolean foldersFirst) {
        var page = listChildren.list(
                scopes.current(), new EntryId(id), listOrder(sort, order, foldersFirst), limit, cursor);
        return new EntryPageResponse(
                page.entries().stream()
                        .map(entry -> CatalogResponseMapper.response(entry, storage))
                        .toList(),
                page.nextCursor());
    }

    @PostMapping(
            value = "/folders",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "createFolder",
            summary = "Create a folder",
            description =
                    "Required Idempotency-Key UUID. Same key and normalized intent replay the original 201 response; changed intent gives 409. Names share one namespace with files and pending uploads. PostgreSQL replay records are durable; fixture records last until restart.")
    @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true, schema = @Schema(type = "string"))
    @ApiResponse(
            responseCode = "201",
            description = "Created or replayed",
            headers = @Header(name = "Location", schema = @Schema(type = "string")),
            content = @Content(schema = @Schema(implementation = FolderEntryResponse.class)))
    @ApiResponse(
            responseCode = "409",
            description = "NAME_CONFLICT or IDEMPOTENCY_CONFLICT",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    @ApiResponse(
            responseCode = "403",
            description = "CSRF_INVALID",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    public ResponseEntity<FolderEntryResponse> createFolder(
            @RequestHeader("Idempotency-Key") UUID idempotencyKey, @Valid @RequestBody CreateFolderRequest request) {
        FileName name;
        try {
            name = new FileName(request.name());
        } catch (IllegalArgumentException exception) {
            throw new InvalidField("name", exception.getMessage());
        }
        var result = CatalogResponseMapper.response(
                createFolder.create(scopes.current(), new EntryId(request.parentId()), name, idempotencyKey));
        return ResponseEntity.created(URI.create("/api/v1/entries/" + result.id()))
                .body(result);
    }

    private static ListOrder listOrder(String sort, String order, boolean foldersFirst) {
        ListOrder.Key key =
                switch (sort) {
                    case "name" -> ListOrder.Key.NAME;
                    case "updatedAt" -> ListOrder.Key.UPDATED_AT;
                    case "size" -> ListOrder.Key.SIZE;
                    default ->
                        throw new InvalidField("sort", "UNSUPPORTED_VALUE", "Sort must be name, updatedAt or size");
                };
        boolean descending =
                switch (order) {
                    case "asc" -> false;
                    case "desc" -> true;
                    default -> throw new InvalidField("order", "UNSUPPORTED_VALUE", "Order must be asc or desc");
                };
        return new ListOrder(key, descending, foldersFirst);
    }
}
