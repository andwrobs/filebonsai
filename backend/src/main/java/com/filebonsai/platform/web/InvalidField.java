package com.filebonsai.platform.web;

public final class InvalidField extends RuntimeException {
    private final String field;

    public InvalidField(String field, String message) {
        super(message);
        this.field = field;
    }

    public String field() {
        return field;
    }
}
