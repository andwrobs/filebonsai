# Domain model

## Core vocabulary

| Noun | Meaning and boundary |
| --- | --- |
| Deployment | One installed Filebonsai application. |
| Workspace | Library ownership and authorization boundary; one initially. |
| Principal / Membership | Authenticated identity and its workspace role; owner initially. |
| FileEntry | Stable logical file or folder with name, parent, revision, status, and current-version pointer. |
| FileVersion | Immutable byte-content revision belonging to a file; folders have none. |
| StoredObject | Physical representation of a version at one storage connection, with verification state. |
| StorageConnection | Operator-managed provider configuration, capabilities, and display name; secrets and paths stay server-side. |
| UploadSession | Durable intent with reserved entry/version, expected integrity, state, lease/fence, and expiry. |
| IdempotencyRecord | Scoped key, canonical intent hash, result reference, and retention. |
| Job / OutboxEvent | Durable asynchronous work and transactional handoff, introduced only when needed. |
| Tag / ShareGrant / DerivedAsset | Later labels, access grants, and version-bound previews that inherit source authorization. |
| AuditEvent | Actor, action, target, outcome, time, and correlation without secrets. |
| StoragePolicy / CostEstimate | Reviewable rule and dated estimate with sources, units, and assumptions—not an invoice. |
| Replica / RestoreRequest / RetentionRule | Later physical copies, archival retrieval, and deletion constraints. |

## Relationships and identity

One deployment owns the initial workspace. Principals act through memberships. The
workspace owns a single immutable root folder. Entries own versions; versions own one
or more stored objects. Storage connections hold objects, never logical hierarchy.
Every lookup and background action carries workspace ownership.

Stable UUIDs identify logical resources. Filenames, request paths, and hierarchy never
choose physical storage keys. Versions and committed object identities are immutable.
Replicas refer to the same version rather than creating additional logical files.

## Names and hierarchy

- Normalize names to Unicode NFC; preserve case and do not trim silently.
- Sibling comparison is case-sensitive with deterministic UTF-8-byte/UUID ordering.
  `Report.pdf` and `report.pdf` may coexist; a case-insensitive export must detect the
  collision rather than overwrite.
- Reject empty names, `.`/`..`, slash, backslash, NUL, controls, malformed UTF-16, and
  names over 255 normalized UTF-8 bytes.
- Root alone has a null parent. Parent and child stay in one workspace; folders cannot
  form cycles.
- Files, folders, and pending upload reservations share the sibling namespace. Pending
  files are hidden from normal listing until available.

## File and upload lifecycle

M1 begins an upload by atomically reserving a new file entry, version, object identity,
and session. It does not overwrite an existing name or upload a new version into an
existing entry. The current-version pointer changes only after verified finalization.
Downloads expose only authorized `AVAILABLE` content.

Cancellation, expiry, and terminal failure may release a reservation only when no
uncertain finalizer can still publish it. Retry uses the same durable intent and cannot
multiply committed versions or side effects. See
[`../architecture/storage-and-transfers.md`](../architecture/storage-and-transfers.md)
for the state machine and reconciliation protocol.

Byte counts use decimal strings on the wire and checked `BIGINT` values within the
configured server limit. Digests name their algorithm. Provider ETags—especially
multipart ETags—are not universal content hashes.
