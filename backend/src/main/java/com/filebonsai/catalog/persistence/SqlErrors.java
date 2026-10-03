package com.filebonsai.catalog.persistence;

import java.sql.SQLException;

/**
 * Classifies database failures by SQLSTATE. Spring's jOOQ wiring translates them into Spring exceptions and plain jOOQ
 * into jOOQ's, so the state is read from the {@link SQLException} underneath either.
 */
public final class SqlErrors {
    private static final String UNIQUE_VIOLATION = "23505";

    private SqlErrors() {}

    public static boolean uniqueViolation(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && UNIQUE_VIOLATION.equals(sql.getSQLState())) {
                return true;
            }
        }
        return false;
    }
}
