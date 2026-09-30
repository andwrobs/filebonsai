package com.filebonsai.catalog.web;

import io.swagger.v3.oas.annotations.media.DiscriminatorMapping;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(
        oneOf = {FileEntryResponse.class, FolderDetailsResponse.class},
        discriminatorProperty = "kind",
        discriminatorMapping = {
            @DiscriminatorMapping(value = "file", schema = FileEntryResponse.class),
            @DiscriminatorMapping(value = "folder", schema = FolderDetailsResponse.class)
        })
public sealed interface EntryDetailsResponse permits FileEntryResponse, FolderDetailsResponse {}
