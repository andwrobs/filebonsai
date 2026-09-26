# Foundations

Harnesses that make every later slice cheaper to prove.

Durable jobs unlock previews, purge, re-tiering, scrubbing and export. An end-to-end browser harness replaces manual Chrome sessions as UI evidence. CI currently runs only the Java suite. These are the best items to pick up when you want the next month of work to be faster.

See [the backlog index](README.md) for how to pick up and retire items.

## ENG-01 Web CI and contract drift checks

`P1` · `S` · Build · Ops

Depends on: none

**Why.** CI runs only the Java suite (catalog-java.yml). Web tests, typecheck, build and generated-client drift can break without anyone noticing.

**Outcome.** Workflow jobs for the web client (npm ci, test, typecheck, build), a contract export diffed against backend/contract/openapi.json, and generated-client compile and decode checks, with caching and path filters.

**Acceptance**

- A DTO change without a regenerated contract fails CI
- A web type error fails CI
- A typical run finishes in under 10 minutes

**Checks:** Ask before pushing a branch, then observe the workflow run

## ENG-02 Playwright end-to-end harness

`P1` · `M` · Build · Web, Ops

Depends on: none

**Why.** Browser evidence currently comes from manual Chrome sessions. Every UI claim needs rendered inspection, and a harness makes that repeatable.

**Outcome.** web/e2e with pinned Playwright Chromium. Global setup starts a disposable PostgreSQL, boots the backend with a generated owner password, and runs sign-in → folder → upload → download (digest) → sign-out at both viewports with reduced motion and traces on failure.

**Acceptance**

- One local command runs it
- No secrets committed; screenshots and traces go to a gitignored directory
- Output stays bounded; a failure points to its trace

**Settle first**

- Keep it under web/ rather than adding a top-level tooling/ directory

**Read:** `docs/development/testing.md`, `docs/product/design.md`  
**Checks:** The e2e command passes twice in a row locally

## ENG-03 Synthetic demo library generator

`P2` · `S` · Build · Ops, Web · Fun

Depends on: none

**Why.** design.md says demo files must be visibly synthetic. Screenshots, performance runs and demos need realistic volume.

**Outcome.** A deterministic script that builds a demo library through the public API: nested folders, images stamped SAMPLE, small PDFs and text files, long and Unicode names, a folder with 2,000 children, duplicate pairs and zero-byte files.

**Acceptance**

- Refuses non-loopback hosts unless forced
- Reruns are safe thanks to idempotency keys
- ENG-02 fixtures reuse it

**Checks:** Run twice against a local deployment; the second run creates nothing new

## ENG-04 Decision: durable jobs and outbox

`P1` · `S` · Decision · Backend

Depends on: none

**Why.** Thumbnails, purge, re-tiering, scrubbing and export all need durable background work. R2 recovery is currently a one-off periodic task.

**Outcome.** A decision record comparing a PostgreSQL job table with SKIP LOCKED leases, fences and a transactional outbox against a library such as db-scheduler or JobRunr. It covers retry and backoff, idempotent handlers, dead letters, per-kind budgets, restart behaviour, workspace scope and metrics.

**Acceptance**

- Compares at least two options against INV-07, INV-09 and INV-10
- Names the first consumer
- Lists migration and test obligations

**Invariants:** INV-07, INV-09, INV-10  
**Read:** `docs/architecture/backend.md`, `docs/architecture/storage-and-transfers.md`, `docs/decisions/0002-modular-monolith.md`  
**Checks:** `decision-review`

## ENG-05 Job runner with a first consumer

`P1` · `L` · Build · Backend

Depends on: [ENG-04](#eng-04-decision-durable-jobs-and-outbox)

**Why.** This is the build half of ENG-04 and a prerequisite for most M3 to M5 work.

**Outcome.** Job and outbox tables, a leased and fenced worker, retry and backoff, dead letters, graceful shutdown and metrics. The first consumer cleans up expired idempotency records and name reservations, or takes over R2's periodic recovery.

**Acceptance**

- PostgreSQL tests: lease-expiry takeover, stale-worker fencing, one effect under duplicate delivery, and a crash between claim and completion
- Outbox rows are enqueued in the same transaction as the state change
- No transaction spans handler I/O

**Invariants:** INV-07, INV-09, INV-10  
**Checks:** `postgres`

## ENG-06 Architecture tests

`P2` · `S` · Build · Backend

Depends on: none

**Why.** Package boundaries in backend.md are enforced only by review.

**Outcome.** ArchUnit rules: domain code depends on no Spring, Jackson, jOOQ or OpenAPI types; generated jOOQ types stay in persistence; DTOs stay in web; no capability imports another capability's persistence; no generic shared package.

**Acceptance**

- Rules pass, with any existing violations fixed or recorded
- Failure messages point to docs/architecture/backend.md

**Read:** `docs/architecture/backend.md`, `docs/development/java.md`  
**Checks:** `backend`

## ENG-07 Property-based tests for names and upload states

`P2` · `M` · Build · Backend · Fun

Depends on: none

**Why.** Name rules and the upload state machine are exactly where generated inputs find bugs.

**Outcome.** jqwik properties: NFC normalization is idempotent, byte limits hold, and rejected characters are rejected. Java ordering matches PostgreSQL ordering for random sets. Random begin, put, complete, cancel, expire and recover sequences never break terminal-state or publication rules.

**Acceptance**

- Shrunk counterexamples are reproducible from a seed
- Runtime stays bounded for regular CI

**Invariants:** INV-05, INV-08, INV-09  
**Checks:** `postgres`

## ENG-08 Crash-injection harness for transfers

`P2` · `L` · Build · Backend · Fun

Depends on: none

**Why.** Recovery claims deserve a kill -9, not just injected exceptions.

**Outcome.** Named fault points (after promote but before commit, after R2 completion but before HEAD, mid-part). A test halts a child JVM at a fault point, restarts it against the same PostgreSQL and storage, and asserts that the system converges.

**Acceptance**

- At least five fault points across the local and fake-R2 paths
- Asserts INV-04, INV-09, INV-10 and name reservation
- Fault hooks exist only in a test profile and can't be reached in production

**Invariants:** INV-04, INV-09, INV-10  
**Checks:** `postgres`

## ENG-09 Observability baseline

`P2` · `M` · Build · Backend, Ops

Depends on: none

**Why.** Operators need to see transfers, reconciliation and failures without reading secrets.

**Outcome.** Structured JSON logs correlated by requestId, Micrometer metrics (upload durations and bytes, reconciliation counts, login failures, job queue depth), and separate liveness and readiness checks, where readiness fails if the database is down or the storage root isn't writable.

**Acceptance**

- A redaction test proves no secrets, tokens or paths appear in logs
- Readiness is tested for both failure modes

**Invariants:** INV-11  
**Checks:** `backend`

## ENG-10 Measured resource baselines for transfers

`P2` · `M` · Proof · Backend

Depends on: none

Context: PR #3 (merged 2026-09-23) measured one 9 MiB body through a slow synthetic R2 gateway; the numbers are in status.md. Four concurrent 128 MiB uploads, threads, file descriptors and the local path are still unmeasured.

**Why.** INV-15 needs recorded numbers before any limit is raised.

**Outcome.** Measure heap, threads, file descriptors and time for four concurrent 128 MiB uploads plus downloads on the local and fake-R2 paths. Record baselines in status.md and add a coarse regression guard.

**Acceptance**

- Measurement method and environment recorded
- Every result falls within the configured bounds

**Invariants:** INV-15  
**Checks:** Recorded measurement run

## ENG-11 Migration upgrade test harness

`P2` · `M` · Build · Backend

Depends on: none

**Why.** Every future migration has to preserve identities and pointers (INV-16).

**Outcome.** A test that migrates to Vn-1, seeds representative data, migrates to the latest version, and asserts identities, memberships, pointers and constraints. It serves as a template for new migrations.

**Acceptance**

- Covers the latest two migrations
- Documented in testing.md

**Invariants:** INV-16  
**Checks:** `postgres`

## ENG-12 Anchor byte-count patterns in the contract

`P3` · `S` · Build · Backend · Public API change

Depends on: none

**Why.** `BeginUploadRequest.sizeBytes` and `UploadResponse.sizeBytes` declare the unanchored pattern `0|[1-9][0-9]*`, while `CurrentVersionResponse.sizeBytes` is anchored. OpenAPI patterns use JavaScript regex semantics, so any string containing a digit matches, and generated validators inherit that. `UploadLimitsResponse.maximumBytes` (M1-04) already uses `^(0|[1-9][0-9]*)$`.

**Outcome.** Every decimal byte-count field in the exported contract uses one anchored pattern.

**Acceptance**

- The OpenAPI export test asserts the anchored pattern on each byte-count field
- Generated TypeScript and Swift clients still compile and decode

**Checks:** `contract`
