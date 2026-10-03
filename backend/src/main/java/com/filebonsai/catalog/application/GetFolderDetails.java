package com.filebonsai.catalog.application;

import com.filebonsai.catalog.domain.Entry;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import java.util.List;

/** Reads a folder and the folders above it from one snapshot, so its parent is always the last ancestor. */
public interface GetFolderDetails {
    record Ancestor(EntryId id, FileName name) {}

    /** {@code ancestors} runs from the workspace root to the folder's parent; empty for the root. */
    record FolderDetails(Entry.Folder folder, List<Ancestor> ancestors) {
        public FolderDetails {
            ancestors = List.copyOf(ancestors);
        }
    }

    FolderDetails details(CatalogScope scope, EntryId folderId);
}
