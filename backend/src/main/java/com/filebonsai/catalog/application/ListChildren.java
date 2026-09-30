package com.filebonsai.catalog.application;

import com.filebonsai.catalog.domain.Entry;
import com.filebonsai.catalog.domain.EntryId;
import java.util.List;

public interface ListChildren {
    /** Limits a listing to one kind; null lists both. */
    enum Kind {
        FOLDER,
        FILE
    }

    Page list(CatalogScope scope, EntryId folderId, ListOrder order, Kind kind, int limit, String cursor);

    default Page list(CatalogScope scope, EntryId folderId, ListOrder order, int limit, String cursor) {
        return list(scope, folderId, order, null, limit, cursor);
    }

    record Page(List<Entry> entries, String nextCursor) {
        public Page {
            entries = List.copyOf(entries);
        }
    }
}
