package com.filebonsai.transfers.application;

import com.filebonsai.catalog.application.CatalogScope;
import java.util.UUID;

@FunctionalInterface
public interface CancelUpload {
    UploadSession cancel(CatalogScope scope, UUID uploadId);
}
