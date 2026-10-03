package com.filebonsai.catalog.web;

import com.filebonsai.catalog.application.CatalogScopeProvider;
import com.filebonsai.catalog.application.CreateFolder;
import com.filebonsai.catalog.application.GetEntry;
import com.filebonsai.catalog.application.GetFolderDetails;
import com.filebonsai.catalog.application.GetWorkspaceRoot;
import com.filebonsai.catalog.application.ListChildren;
import com.filebonsai.catalog.application.ListOrder;
import com.filebonsai.catalog.application.MoveEntries;
import com.filebonsai.catalog.application.StorageConnectionName;
import com.filebonsai.catalog.domain.Entry;
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
import java.util.HashSet;
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
    private final GetFolderDetails getFolderDetails;
    private final GetWorkspaceRoot getWorkspaceRoot;
    private final ListChildren listChildren;
    private final CreateFolder createFolder;
    private final MoveEntries moveEntries;
    private final CatalogScopeProvider scopes;
    private final StorageConnectionName storage;

    public CatalogController(
            GetEntry getEntry,
            GetFolderDetails getFolderDetails,
            GetWorkspaceRoot getWorkspaceRoot,
            ListChildren listChildren,
            CreateFolder createFolder,
            MoveEntries moveEntries,
            CatalogScopeProvider scopes,
            StorageConnectionName storage) {
        this.getEntry = getEntry;
        this.getFolderDetails = getFolderDetails;
        this.getWorkspaceRoot = getWorkspaceRoot;
        this.listChildren = listChildren;
        this.createFolder = createFolder;
        this.moveEntries = moveEntries;
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
            content = @Content(schema = @Schema(implementation = EntryDetailsResponse.class)))
    public EntryDetailsResponse getEntry(@PathVariable UUID id) {
        var scope = scopes.current();
        var entryId = new EntryId(id);
        Entry entry = getEntry.get(scope, entryId);
        return switch (entry) {
            case Entry.Folder ignored -> CatalogResponseMapper.details(getFolderDetails.details(scope, entryId));
            case Entry.File file -> (FileEntryResponse) CatalogResponseMapper.response(file, storage);
        };
    }

    @GetMapping(value = "/entries/{id}/children", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listChildren",
            summary = "List direct children",
            description =
                    "Ordered by `sort`, then NFC name in UTF-8 byte order, then ID; `desc` reverses all three. `foldersFirst` keeps folders ahead of files in either direction. `kind` limits the page to folders or files; the order is unchanged. `updatedAt` is the entry's `updatedAt`. `size` is the current version's `sizeBytes`, and a folder sorts below any file. No snapshot: inserts or changes behind the cursor may be missed, and changes ahead may repeat an entry. Deduplicate by ID or refresh when needed. Tokens are opaque, scoped to the workspace/folder/sort/order/foldersFirst/kind, and invalid after cursor-key rotation; fixture restart rotates its key.")
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
            @RequestParam(defaultValue = "false") boolean foldersFirst,
            @Parameter(schema = @Schema(allowableValues = {"folder", "file"})) @RequestParam(required = false)
                    String kind) {
        var page = listChildren.list(
                scopes.current(), new EntryId(id), listOrder(sort, order, foldersFirst), kind(kind), limit, cursor);
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
            description = "NAME_CONFLICT, IDEMPOTENCY_CONFLICT or DEPTH_LIMIT_EXCEEDED",
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

    @PostMapping(
            value = "/entries/move",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "moveEntries",
            summary = "Move entries into a folder",
            description =
                    "Decision 0012. Required Idempotency-Key UUID; the same key and normalized intent (destination plus each entry and expected revision, in any order) replay the original result without moving anything again, and changed intent gives 409. Each item is evaluated under lock in canonical entry-ID order and reported separately, so some may move while others fail; the response is 200 either way. An entry inside another selected folder moves with it and is not checked against its own revision. Moving changes only the parent and revision: names, updatedAt, versions and stored objects stay as they are. The destination is named by ID and need not be where the client last saw it. A missing, inaccessible or file destination fails the whole request and changes nothing.")
    @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true, schema = @Schema(type = "string"))
    @ApiResponse(
            responseCode = "200",
            description = "Per-item results, new or replayed",
            content = @Content(schema = @Schema(implementation = MoveEntriesResponse.class)))
    @ApiResponse(
            responseCode = "409",
            description = "IDEMPOTENCY_CONFLICT",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    @ApiResponse(
            responseCode = "403",
            description = "CSRF_INVALID",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    public MoveEntriesResponse moveEntries(
            @RequestHeader("Idempotency-Key") UUID idempotencyKey, @Valid @RequestBody MoveEntriesRequest request) {
        var seen = new HashSet<UUID>();
        var items = request.items().stream()
                .map(item -> {
                    if (!seen.add(item.entryId())) {
                        throw new InvalidField("items", "DUPLICATE_ENTRY", "Each entry may appear only once");
                    }
                    return new MoveEntries.Item(new EntryId(item.entryId()), item.expectedRevision());
                })
                .toList();
        return CatalogResponseMapper.moved(
                moveEntries.move(scopes.current(), new EntryId(request.destinationId()), items, idempotencyKey));
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

    private static ListChildren.Kind kind(String kind) {
        if (kind == null || kind.isEmpty()) {
            return null;
        }
        return switch (kind) {
            case "folder" -> ListChildren.Kind.FOLDER;
            case "file" -> ListChildren.Kind.FILE;
            default -> throw new InvalidField("kind", "UNSUPPORTED_VALUE", "Kind must be folder or file");
        };
    }
}
