# Integrity & recovery

A library you can prove is intact and can rebuild from an export. This is M4.

Recovery means hierarchy, names, versions and digests, not just opaque bytes. A scrubber that re-reads and re-hashes stored objects on a budget is quiet, impressive backend work that fits downtime well.

See [the backlog index](README.md) for how to pick up and retire items.

## REC-01 Integrity scrubber

`P2` · `L` · Build · Backend, Web

Depends on: [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer)

**Why.** Proving bytes are still intact, not just assuming it, is the kind of engineering this project wants to show.

**Outcome.** A background job re-reads stored objects within a byte-rate budget, recomputes SHA-256, records the last verified time, flags missing or mismatched objects, and reports on the Storage page. With replicas (TIER-04) it repairs from a healthy copy.

**Acceptance**

- Budget respected (measured)
- A corrupted fixture is detected and reported
- Never mutates original bytes

**Invariants:** INV-15  
**Checks:** `postgres`; `web`

## REC-02 Consistency report

`P2` · `S` · Build · Backend

Depends on: none

**Why.** Before any automatic cleanup exists, operators should be able to see drift.

**Outcome.** A read-only admin report: files on disk without object rows, object rows with missing bytes, entries without a current version, and leftover sessions and reservations. Bounded scan; no deletion.

**Acceptance**

- Runs against local storage with injected drift fixtures
- No paths leak into ordinary APIs

**Invariants:** INV-11  
**Checks:** `postgres`

## REC-03 Decision: export format

`P2` · `S` · Decision · Docs, Backend

Depends on: none

**Why.** The recovery contract requires an open export manifest.

**Outcome.** A JSON Lines manifest (workspace, hierarchy, names, versions, sizes, digests, tags, timestamps) with objects stored by digest, a schema version, case-collision safety, and no credentials or sessions.

**Acceptance**

- Hand-readable example included
- Import rules for UUIDs decided

**Invariants:** INV-13  
**Read:** `docs/architecture/storage-and-transfers.md`  
**Checks:** `decision-review`

## REC-04 Export command

`P3` · `M` · Build · Backend

Depends on: [REC-03](#rec-03-decision-export-format)

**Why.** An export you can trust is the start of every recovery story.

**Outcome.** An administrative export to a directory or tarball. The catalog snapshot is read in a short transaction and objects are streamed afterwards. Digests are verified on write, and the export is resumable and logs progress.

**Acceptance**

- No transaction across I/O
- Every exported digest verified

**Invariants:** INV-07, INV-13  
**Checks:** `postgres`

## REC-05 Restore into a clean installation

`P3` · `M` · Proof · Backend, Ops

Depends on: [REC-04](#rec-04-export-command), [M1-07](finish-m1.md#m1-07-container-image-and-compose-from-a-clean-checkout)

**Why.** INV-13: recovery recreates usable files and hierarchy.

**Outcome.** Import an export into an empty deployment, recreate hierarchy, versions and tags, verify every digest, and compare tree listings against the source.

**Acceptance**

- Digest and tree comparison recorded
- UUID preservation handled as decided

**Invariants:** INV-13  
**Checks:** `postgres`; Recorded restore drill

## REC-06 Backup and restore drill

`P3` · `M` · Proof · Ops

Depends on: [M1-07](finish-m1.md#m1-07-container-image-and-compose-from-a-clean-checkout)

**Why.** Operators need a measured, ordered procedure.

**Outcome.** A documented procedure for PostgreSQL dump plus data root or R2: dump the database first, then copy the immutable objects (orphans are acceptable, missing objects are not). A scripted drill runs on the Compose deployment.

**Acceptance**

- The drill restores to a working, verified library
- Timing recorded

**Checks:** Recorded drill

## REC-07 Upgrade drill

`P3` · `M` · Proof · Ops

Depends on: [M1-07](finish-m1.md#m1-07-container-image-and-compose-from-a-clean-checkout), [ENG-11](foundations.md#eng-11-migration-upgrade-test-harness)

**Why.** INV-16 on a real deployment, not only in tests.

**Outcome.** Install version N's image, create data, upgrade to N+1, and verify identities, permissions and pointers.

**Acceptance**

- Recorded run

**Invariants:** INV-16  
**Checks:** Recorded drill
