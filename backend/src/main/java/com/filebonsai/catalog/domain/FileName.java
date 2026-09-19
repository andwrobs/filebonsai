package com.filebonsai.catalog.domain;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;

/** Locale-independent logical name. Never use this value as a filesystem path. */
public record FileName(String value) {
    public FileName {
        if (value == null) {
            throw new IllegalArgumentException("Name is required");
        }
        value = Normalizer.normalize(value, Normalizer.Form.NFC);
        if (value.isEmpty()
                || value.equals(".")
                || value.equals("..")
                || value.indexOf('/') >= 0
                || value.indexOf('\\') >= 0) {
            throw new IllegalArgumentException(
                    "Name must be nonempty and cannot be '.', '..', or contain path separators");
        }
        if (value.codePoints().anyMatch(c -> Character.isISOControl(c) || (c >= 0xD800 && c <= 0xDFFF))) {
            throw new IllegalArgumentException("Name cannot contain control characters or unpaired surrogates");
        }
        if (value.getBytes(StandardCharsets.UTF_8).length > 255) {
            throw new IllegalArgumentException("Name must be at most 255 UTF-8 bytes after NFC normalization");
        }
    }
}
