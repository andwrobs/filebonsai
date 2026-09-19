package com.filebonsai.catalog.application;

public final class CatalogFailure extends RuntimeException {
    public enum Reason {
        ENTRY_NOT_FOUND,
        NOT_A_FOLDER,
        NAME_CONFLICT,
        IDEMPOTENCY_CONFLICT,
        INVALID_CURSOR,
        VALIDATION_FAILED
    }

    private final Reason reason;

    public CatalogFailure(Reason reason, String message) {
        super(message);
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}
