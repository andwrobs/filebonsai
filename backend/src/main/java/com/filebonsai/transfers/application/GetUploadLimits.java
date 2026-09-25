package com.filebonsai.transfers.application;

import com.filebonsai.catalog.application.CatalogScope;

@FunctionalInterface
public interface GetUploadLimits {
    UploadLimits limits(CatalogScope scope);
}
