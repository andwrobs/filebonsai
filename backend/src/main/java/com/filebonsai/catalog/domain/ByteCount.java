package com.filebonsai.catalog.domain;

/** Checked signed-64-bit storage value; the HTTP mapper emits decimal text. */
public record ByteCount(long value) {
    public ByteCount {
        if (value < 0) {
            throw new IllegalArgumentException("Byte count must be nonnegative");
        }
    }

    public ByteCount plus(ByteCount other) {
        return new ByteCount(Math.addExact(value, other.value));
    }

    public String decimal() {
        return Long.toString(value);
    }
}
