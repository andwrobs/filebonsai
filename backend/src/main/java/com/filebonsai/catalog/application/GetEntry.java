package com.filebonsai.catalog.application;

import com.filebonsai.catalog.domain.Entry;
import com.filebonsai.catalog.domain.EntryId;

public interface GetEntry {
    Entry get(CatalogScope scope, EntryId id);
}
