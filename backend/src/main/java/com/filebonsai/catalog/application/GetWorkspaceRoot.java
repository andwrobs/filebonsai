package com.filebonsai.catalog.application;

import com.filebonsai.catalog.domain.Entry;

/** Resolves the one root folder belonging to the authenticated workspace scope. */
public interface GetWorkspaceRoot {
    Entry.Folder get(CatalogScope scope);
}
