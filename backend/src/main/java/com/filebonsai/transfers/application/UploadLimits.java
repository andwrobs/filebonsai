package com.filebonsai.transfers.application;

import com.filebonsai.catalog.domain.ByteCount;
import java.util.Objects;

/** Effective limits a client may check before sending; the server still enforces them on every upload. */
public record UploadLimits(ByteCount maximumBytes) {
    public UploadLimits {
        Objects.requireNonNull(maximumBytes);
    }
}
