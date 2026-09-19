# Product invariants

These stable IDs are cross-cutting test oracles. A bounded task names the IDs it can
affect and supplies the relevant evidence. Change a guarantee deliberately through a
decision record, never to accommodate a failing implementation.

| ID | Guarantee | Evidence when the feature exists |
| --- | --- | --- |
| INV-01 | Resource operations are scoped to the authenticated principal/workspace; unknown and inaccessible IDs are indistinguishable. | Cross-principal list/get/upload/finalize/download tests |
| INV-02 | A user filename or request path never controls a physical storage path. | Traversal, Unicode, symlink, and separator fixtures |
| INV-03 | Version object keys are unique and immutable after commit. | Duplicate/replayed completion cannot overwrite bytes |
| INV-04 | `AVAILABLE` requires verified stored bytes plus a committed catalog pointer. | Failure between promotion and DB commit reconciles correctly |
| INV-05 | An idempotency key identifies one intent; a changed intent conflicts. | Replay and concurrent request tests |
| INV-06 | Size and digest verification are server/provider authoritative. | Wrong length or supplied digest cannot finalize |
| INV-07 | No database transaction spans file transfer or provider network I/O. | Code review plus transaction/pool behavior under slow I/O |
| INV-08 | Names reserve atomically; invalid parents, cycles, and cross-workspace parents are rejected. | Concurrent duplicate and invalid-parent tests |
| INV-09 | Stale workers cannot publish cancelled work or overwrite a newer attempt. | Lease/fencing and cancellation races |
| INV-10 | Retry/restart cannot lose durable intent or multiply committed side effects. | Crash injection around state changes and publication |
| INV-11 | Credentials, session secrets, signed URLs, and internal paths stay out of DTOs, logs, and evidence. | Response, log, and serialization inspection |
| INV-12 | Derived assets and version history honor source authorization. | Required when those features ship |
| INV-13 | Recovery recreates usable files and hierarchy, not only opaque bytes. | Restore into a clean installation and compare digests |
| INV-14 | UI status reflects server state; uncertain finalization is visible and recoverable. | Browser retry/reconcile/pending scenarios |
| INV-15 | Processing is bounded in memory, time, and configured size. | Streaming and limit tests with recorded baselines |
| INV-16 | Schema upgrades preserve identities, permissions, and pointers. | Real PostgreSQL fresh/previous-version migration checks |

Not every future invariant is tested before its feature exists. A task is complete
only when its applicable guarantees have evidence and limitations are explicit.
