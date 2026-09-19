package com.filebonsai.catalog.application;

import com.filebonsai.catalog.domain.Entry;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import java.util.UUID;

public interface CreateFolder {
    Entry.Folder create(CatalogScope scope, EntryId parentId, FileName name, UUID idempotencyKey);
}
