package com.filebonsai.platform.web;

public final class InvalidField extends RuntimeException {
    private final String field;
    private final String code;

    public InvalidField(String field, String message) {
        this(field, "INVALID_NAME", message);
    }

    public InvalidField(String field, String code, String message) {
        super(message);
        this.field = field;
        this.code = code;
    }

    public String field() {
        return field;
    }

    public String code() {
        return code;
    }
}
