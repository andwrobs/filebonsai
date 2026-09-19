package com.filebonsai.catalog.web;

import com.filebonsai.catalog.domain.Entry;

final class CatalogResponseMapper {
    private CatalogResponseMapper() {}

    static EntryResponse response(Entry entry) {
        return switch (entry) {
            case Entry.File file ->
                new FileEntryResponse(
                        FileEntryResponse.Kind.file,
                        file.id().value(),
                        file.parentId().value(),
                        file.name().value(),
                        file.createdAt(),
                        file.updatedAt(),
                        new CurrentVersionResponse(
                                file.currentVersion().id().value(),
                                file.currentVersion().sizeBytes().decimal()));
            case Entry.Folder folder -> response(folder);
        };
    }

    static FolderEntryResponse response(Entry.Folder folder) {
        return new FolderEntryResponse(
                FolderEntryResponse.Kind.folder,
                folder.id().value(),
                folder.parentId() == null ? null : folder.parentId().value(),
                folder.name().value(),
                folder.createdAt(),
                folder.updatedAt());
    }
}
