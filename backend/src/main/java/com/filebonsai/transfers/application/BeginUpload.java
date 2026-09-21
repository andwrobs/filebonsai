package com.filebonsai.transfers.application;

import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import java.util.UUID;

@FunctionalInterface
public interface BeginUpload {
    UploadSession begin(
            CatalogScope scope,
            EntryId parentId,
            FileName name,
            ByteCount expectedSize,
            byte[] expectedSha256,
            UUID idempotencyKey);
}
