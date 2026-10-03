package com.filebonsai.catalog.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

public record MoveEntriesResponse(
        @ArraySchema(
                arraySchema =
                        @Schema(
                                requiredMode = REQUIRED,
                                description = "One result per requested entry, in canonical entry-ID order"))
        List<Item> items) {

    @Schema(name = "MoveEntryResult")
    public record Item(
            @Schema(requiredMode = REQUIRED) UUID entryId,

            @Schema(
                    requiredMode = REQUIRED,
                    description =
                            "MOVED: now in the destination. MOVED_WITH_ANCESTOR: a selected folder above it moved,"
                                    + " carrying it. UNCHANGED: already in the destination. ANCESTOR_NOT_MOVED: a"
                                    + " selected folder above it failed, so it stayed. NOT_FOUND: missing or"
                                    + " inaccessible. REVISION_CONFLICT: changed since the client read it."
                                    + " NAME_CONFLICT: an entry or pending upload in the destination holds the name."
                                    + " CANNOT_MOVE_ROOT. DESTINATION_INSIDE_ENTRY: the destination is the folder or"
                                    + " inside it. DEPTH_LIMIT_EXCEEDED: a folder would pass the depth limit.")
            Outcome outcome,

            @Schema(
                    requiredMode = REQUIRED,
                    nullable = true,
                    minimum = "1",
                    description = "The entry's revision after the request; null only for NOT_FOUND")
            Long revision,

            @Schema(
                    requiredMode = REQUIRED,
                    nullable = true,
                    description = "The folder the entry left; set only for MOVED")
            UUID previousParentId) {}

    public enum Outcome {
        MOVED,
        MOVED_WITH_ANCESTOR,
        UNCHANGED,
        ANCESTOR_NOT_MOVED,
        NOT_FOUND,
        REVISION_CONFLICT,
        NAME_CONFLICT,
        CANNOT_MOVE_ROOT,
        DESTINATION_INSIDE_ENTRY,
        DEPTH_LIMIT_EXCEEDED
    }
}
