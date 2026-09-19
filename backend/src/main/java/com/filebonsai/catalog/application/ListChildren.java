package com.filebonsai.catalog.application;

import com.filebonsai.catalog.domain.Entry;
import com.filebonsai.catalog.domain.EntryId;
import java.util.List;

public interface ListChildren {
    Page list(CatalogScope scope, EntryId folderId, int limit, String cursor);

    record Page(List<Entry> entries, String nextCursor) {
        public Page {
            entries = List.copyOf(entries);
        }
    }
}
