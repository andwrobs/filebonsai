package com.filebonsai.transfers.application;

import com.filebonsai.catalog.application.CatalogScope;
import java.util.UUID;

@FunctionalInterface
public interface CompleteUpload {
    UploadSession complete(CatalogScope scope, UUID uploadId);
}
