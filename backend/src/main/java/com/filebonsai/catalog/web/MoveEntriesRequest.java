package com.filebonsai.catalog.web;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record MoveEntriesRequest(
        @NotNull @Schema(requiredMode = REQUIRED, description = "The folder to move the entries into")
        UUID destinationId,

        @NotNull
        @Size(min = 1, max = 1000)
        @ArraySchema(
                arraySchema =
                        @Schema(
                                requiredMode = REQUIRED,
                                description = "1–1000 entries, each named once; the order doesn't matter"),
                minItems = 1,
                maxItems = 1000)
        List<@Valid @NotNull Item> items) {

    @Schema(name = "MoveEntryRequestItem")
    public record Item(
            @NotNull @Schema(requiredMode = REQUIRED) UUID entryId,

            @NotNull
            @Min(1)
            @Schema(
                    requiredMode = REQUIRED,
                    minimum = "1",
                    description = "The entry's revision as the client last read it")
            Long expectedRevision) {}
}
