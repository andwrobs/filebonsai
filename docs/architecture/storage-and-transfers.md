# Storage, transfers, processing, and recovery

## Trust and storage boundaries

The Filebonsai server is trusted with plaintext content and operator-supplied storage
credentials. Credentials are resolved server-side and never returned in ordinary DTOs,
logs, screenshots, or task evidence. Arbitrary provider endpoints are privileged
configuration because connection tests can become server-side request forgery.

User filenames are metadata. Internal immutable object identifiers choose storage
locations. The local adapter runs under an unprivileged account with an explicit data
root and defends against traversal and symlink escape. Upload processing is streaming
and bounded by configured size, memory, duration, and concurrency limits.

## M1 upload protocol

The default maximum is 128 MiB and default expiry is 24 hours; both are configurable.
Zero-byte files are valid. Expected SHA-256 is optional, but the server computes and
verifies size and SHA-256 before publication.

1. Begin upload persists intent and atomically reserves a name, entry, version, object
   identity, and session before external I/O.
2. PUT content acquires a lease/fence and streams to an attempt-specific temporary file
   on the same filesystem as the final destination while computing size and digest.
3. A verified body becomes `STAGED`. An interrupted or mismatched body returns to
   `INITIATED` after safely discarding only that owned attempt.
4. Completion persists `FINALIZING` before promoting bytes atomically without overwrite.
5. A short catalog transaction records `AVAILABLE` and the current-version pointer.
6. An uncertain result becomes `RECONCILING`; restart inspection of accepted temporary
   and final bytes repairs the catalog or returns to a recoverable state.

PostgreSQL and the filesystem do not share a transaction. No database transaction may
span body streaming, promotion, or provider calls. M1 retries resend the entire body
from byte zero on the same upload session; it is not offset resume.

## Upload states

`INITIATED → RECEIVING → STAGED → FINALIZING → AVAILABLE` is the happy path.
`FINALIZING → RECONCILING` handles uncertain completion. Reconciliation may move to
`AVAILABLE` after verified repair, back to `STAGED` when the accepted temporary body
still exists but no final object does, or to terminal `FAILED` when neither can be
recovered. `INITIATED`, `RECEIVING`, and `STAGED` may be fenced into terminal
`CANCELLED` or `EXPIRED`; cancellation conflicts after finalization starts.

Terminal states are `AVAILABLE`, `CANCELLED`, `EXPIRED`, and `FAILED`. Identical staged
content may replay without mutation; completion of an available upload and cancellation
of a cancelled upload return existing state. A stale writer can never publish over the
accepted attempt. Cleanup never deletes bytes involved in uncertain finalization.

## Future cloud and processing work

The first cloud slice selects one real provider and specifies multipart initiation,
signed part requests, resume/listing, completion, abort, checksums, CORS, credential
scope, and timeout-after-success reconciliation. Provider upload IDs remain internal.
Compatibility is proved against that provider, not inferred from an emulator or an
“S3-compatible” label.

Derived previews begin only from a committed immutable version through durable work.
Processor selection validates type and configured budgets; execution constrains CPU,
memory, time, temporary storage, output, and network. Derived assets record processor
version and inherit source authorization. Preview failure never changes original
availability. Image thumbnails come before PDF, office, or video adapters.

## Recovery contract

Recoverability includes catalog, logical names and hierarchy, immutable objects,
required credentials/keys, an open export manifest, and a verified restore procedure.
Recreating opaque bytes is not a successful restore. Schema upgrades preserve logical
identities, permissions, and pointers. Replication and synchronized deletion do not
replace an independently retained backup.
