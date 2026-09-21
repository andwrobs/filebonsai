package com.filebonsai.transfers.application;

import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import java.io.IOException;
import java.io.InputStream;

@FunctionalInterface
public interface DownloadOriginal {
    Download open(CatalogScope scope, EntryId entryId);

    record Download(FileName name, ByteCount size, InputStream content) implements AutoCloseable {
        @Override
        public void close() throws IOException {
            content.close();
        }
    }
}
