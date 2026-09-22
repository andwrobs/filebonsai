package com.filebonsai.storage;

import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;

/** Publishes a verified staged body and serves immutable original bytes. */
public interface PublishedObjectStorage {
    default long maximumBytes() {
        return Long.MAX_VALUE;
    }

    default boolean finishOnRecovery() {
        return false;
    }

    String finalKey(UUID workspaceId, UUID objectId);

    void promote(String temporaryKey, String finalKey, long expectedSize, byte[] expectedSha256) throws IOException;

    boolean verifies(String key, long expectedSize, byte[] expectedSha256) throws IOException;

    InputStream open(String key) throws IOException;
}
