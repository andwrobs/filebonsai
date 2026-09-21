package com.filebonsai.transfers.application;

import com.filebonsai.catalog.application.CatalogScope;
import java.util.UUID;

@FunctionalInterface
public interface GetUpload {
    UploadSession get(CatalogScope scope, UUID uploadId);
}
