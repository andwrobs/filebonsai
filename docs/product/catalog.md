# Catalog behavior

Catalog is the first cross-platform vertical slice. This document describes observable behavior independently of Java, React, or Swift.

- The workspace root is a real folder with a stable ID and a null parent.
- Browsing lists direct children only, with keyset paging and opaque cursors. The order is by name, modified time, or size, ascending or descending, with ties broken by NFC name and then UUID; folders can be kept first. Name ascending is the default.
- Empty folders return an empty page and no cursor.
- Folder creation requires a parent ID, a valid name, and a UUID `Idempotency-Key`.
- Repeating the same key and normalized intent returns the original folder identity. Reusing the key for changed intent conflicts.
- Files, folders, and pending upload reservations share one sibling namespace.
- Changing existing entries (rename, move, trash, restore) follows decision 0012: a revision precondition per entry, an idempotency key per command, and per-item results for bulk operations.
- Missing or inaccessible entries are indistinguishable as `ENTRY_NOT_FOUND`; a file used as a folder target returns `NOT_A_FOLDER`.
- Clients provide loading, empty, validation/error, and not-found states without treating one platform's screen as the specification for another.

The backend contract harness currently proves the HTTP behavior. Web and iOS implementations should consume the generated transport clients and implement this behavior as separate applications.
