package com.filebonsai.catalog.application;

import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import java.util.List;

/** Reads the folders above a folder, ordered from the workspace root to its parent. */
public interface GetFolderAncestors {
    record Ancestor(EntryId id, FileName name) {}

    List<Ancestor> list(CatalogScope scope, EntryId folderId);
}
