package com.filebonsai.catalog.persistence;

import java.util.UUID;
import org.jooq.DSLContext;

/**
 * The per-workspace hierarchy lock from decision 0012, held until the transaction ends. Changing where a folder is or
 * whether it is visible takes it exclusively; adding a child (a folder, an upload or a moved file) takes it shared.
 * Take it after any idempotency-key lock and before locking entry rows.
 */
public final class CatalogHierarchyLock {
    private CatalogHierarchyLock() {}

    public static void shared(DSLContext transaction, UUID workspaceId) {
        transaction.execute("select pg_advisory_xact_lock_shared(hashtextextended(?, 0))", key(workspaceId));
    }

    public static void exclusive(DSLContext transaction, UUID workspaceId) {
        transaction.execute("select pg_advisory_xact_lock(hashtextextended(?, 0))", key(workspaceId));
    }

    private static String key(UUID workspaceId) {
        return "catalog-hierarchy:" + workspaceId;
    }
}
