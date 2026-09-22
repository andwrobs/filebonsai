package com.filebonsai.storage;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/** Narrow S3 operations used by the R2 publisher; keys and upload IDs stay server-side. */
public interface R2Gateway {
    final class MissingUploadException extends IOException {
        public MissingUploadException() {
            super("R2 multipart upload no longer exists");
        }
    }

    record Part(int number, String etag, long size) {}

    record Upload(String key, String id) {}

    void put(String key, byte[] body) throws IOException;

    String createMultipart(String key) throws IOException;

    String uploadPart(String key, String uploadId, int number, byte[] body) throws IOException;

    List<Part> listParts(String key, String uploadId) throws IOException;

    void completeMultipart(String key, String uploadId, List<Part> parts) throws IOException;

    void abortMultipart(String key, String uploadId) throws IOException;

    List<Upload> listMultipartUploads(String keyPrefix) throws IOException;

    Long size(String key) throws IOException;

    InputStream open(String key) throws IOException;

    void delete(String key) throws IOException;
}
