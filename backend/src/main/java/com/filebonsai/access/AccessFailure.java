package com.filebonsai.access;

public final class AccessFailure extends RuntimeException {
    public enum Reason {
        AUTH_REQUIRED,
        INVALID_CREDENTIALS,
        CSRF_INVALID,
        RATE_LIMITED
    }

    private final Reason reason;
    private final long retryAfterSeconds;

    public AccessFailure(Reason reason) {
        this(reason, 0);
    }

    public AccessFailure(Reason reason, long retryAfterSeconds) {
        super(reason.name());
        this.reason = reason;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public Reason reason() {
        return reason;
    }

    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }
}
