# Catalog behavior

Catalog is the first cross-platform vertical slice. This document describes observable behavior independently of Java, React, or Swift.

- The workspace root is a real folder with a stable ID and a null parent.
- Browsing lists direct children only, with NFC-name/UUID keyset ordering and opaque cursors.
- Empty folders return an empty page and no cursor.
- Folder creation requires a parent ID, a valid name, and a UUID `Idempotency-Key`.
- Repeating the same key and normalized intent returns the original folder identity. Reusing the key for changed intent conflicts.
- Files, folders, and pending upload reservations share one sibling namespace.
- Missing or inaccessible entries are indistinguishable as `ENTRY_NOT_FOUND`; a file used as a folder target returns `NOT_A_FOLDER`.
- Clients provide loading, empty, validation/error, and not-found states without treating one platform's screen as the specification for another.

The backend contract harness currently proves the HTTP behavior. Web and iOS implementations should consume the generated transport clients and implement this behavior as separate applications.
