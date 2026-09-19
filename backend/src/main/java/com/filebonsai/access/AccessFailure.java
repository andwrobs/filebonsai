package com.filebonsai.access;

public final class AccessFailure extends RuntimeException {
    public enum Reason {
        AUTH_REQUIRED,
        INVALID_CREDENTIALS,
        CSRF_INVALID
    }

    private final Reason reason;

    public AccessFailure(Reason reason) {
        super(reason.name());
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}
