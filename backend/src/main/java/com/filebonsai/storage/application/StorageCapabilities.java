package com.filebonsai.storage.application;

/**
 * Transfer guarantees a person can rely on for the configured connection. Both providers verify size and SHA-256
 * before publication (local while writing, R2 by reading the object back), restart interrupted uploads from byte
 * zero, and serve only whole originals.
 */
public record StorageCapabilities(boolean sha256Verification, boolean resumableUploads, boolean rangeDownloads) {
    public static StorageCapabilities of(StorageConnection connection) {
        return switch (connection.providerKind()) {
            case "local", "r2" -> new StorageCapabilities(true, false, false);
            default -> throw new IllegalArgumentException("Unsupported storage provider");
        };
    }
}
