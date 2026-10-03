package com.filebonsai.catalog.web;

import com.filebonsai.catalog.application.GetFolderDetails;
import com.filebonsai.catalog.application.MoveEntries;
import com.filebonsai.catalog.application.StorageConnectionName;
import com.filebonsai.catalog.domain.Entry;
import java.util.List;

final class CatalogResponseMapper {
    private CatalogResponseMapper() {}

    static EntryResponse response(Entry entry, StorageConnectionName storage) {
        return switch (entry) {
            case Entry.File file ->
                new FileEntryResponse(
                        FileEntryResponse.Kind.file,
                        file.id().value(),
                        file.parentId().value(),
                        file.name().value(),
                        file.createdAt(),
                        file.updatedAt(),
                        file.revision(),
                        new CurrentVersionResponse(
                                file.currentVersion().id().value(),
                                file.currentVersion().sizeBytes().decimal(),
                                file.currentVersion().sha256(),
                                storage.displayName()),
                        file.versionCount());
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
                folder.updatedAt(),
                folder.revision());
    }

    static FolderDetailsResponse details(GetFolderDetails.FolderDetails details) {
        Entry.Folder folder = details.folder();
        return new FolderDetailsResponse(
                FolderDetailsResponse.Kind.folder,
                folder.id().value(),
                folder.parentId() == null ? null : folder.parentId().value(),
                folder.name().value(),
                folder.createdAt(),
                folder.updatedAt(),
                folder.revision(),
                details.ancestors().stream()
                        .map(ancestor -> new FolderAncestorResponse(
                                ancestor.id().value(), ancestor.name().value()))
                        .toList());
    }

    static MoveEntriesResponse moved(List<MoveEntries.ItemResult> results) {
        return new MoveEntriesResponse(results.stream()
                .map(result -> new MoveEntriesResponse.Item(
                        result.entryId().value(),
                        MoveEntriesResponse.Outcome.valueOf(result.outcome().name()),
                        result.revision(),
                        result.previousParentId() == null
                                ? null
                                : result.previousParentId().value()))
                .toList());
    }
}
