package com.filebonsai.transfers.application;

import com.filebonsai.catalog.application.CatalogScope;
import java.io.InputStream;
import java.util.UUID;

@FunctionalInterface
public interface ReceiveUpload {
    UploadSession receive(CatalogScope scope, UUID uploadId, InputStream content);
}
