package com.filebonsai.transfers.application;

public final class UploadFailure extends RuntimeException {
    public enum Reason {
        UPLOAD_NOT_FOUND,
        ENTRY_NOT_FOUND,
        NAME_CONFLICT,
        IDEMPOTENCY_CONFLICT,
        INVALID_STATE,
        SIZE_MISMATCH,
        DIGEST_MISMATCH,
        EXPIRED,
        TOO_LARGE,
        STORAGE_UNAVAILABLE
    }

    private final Reason reason;

    public UploadFailure(Reason reason, String message) {
        super(message);
        this.reason = reason;
    }

    public UploadFailure(Reason reason, String message, Throwable cause) {
        super(message, cause);
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}
