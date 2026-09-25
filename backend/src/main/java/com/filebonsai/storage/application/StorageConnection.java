package com.filebonsai.storage.application;

import java.util.Locale;
import java.util.Objects;

/**
 * What the Storage page may say about the configured connection. It deliberately carries no bucket, account,
 * endpoint, credential, or path: the operator chooses the display name.
 */
public record StorageConnection(String displayName, String providerKind) {
    private static final int MAXIMUM_DISPLAY_NAME_LENGTH = 80;

    public StorageConnection {
        Objects.requireNonNull(displayName);
        Objects.requireNonNull(providerKind);
        if (displayName.isBlank()
                || displayName.codePointCount(0, displayName.length()) > MAXIMUM_DISPLAY_NAME_LENGTH
                || displayName.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(
                    "Storage display name must be 1-80 characters without control characters");
        }
    }

    /** Applies the provider's default name when the operator configured none. */
    public static StorageConnection configured(String provider, String displayName) {
        String name = displayName == null ? "" : displayName.strip();
        // Spring's provider conditions ignore case, so "R2" must select the same connection as "r2".
        return switch (provider.strip().toLowerCase(Locale.ROOT)) {
            case "local" -> new StorageConnection(name.isEmpty() ? "Local disk" : name, "local");
            case "r2" -> new StorageConnection(name.isEmpty() ? "Cloudflare R2" : name, "r2");
            default -> throw new IllegalArgumentException("Unsupported storage provider");
        };
    }
}
