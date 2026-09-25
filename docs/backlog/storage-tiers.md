# Storage tiers & placement

Files stay where they are in the library while their bytes move between hot, cool and cold storage. Each move is verified before it takes effect and the old copy is retired afterwards.

Placement is what sets Filebonsai apart. A tier is a storage connection plus a storage class. R2 alone offers Standard and Infrequent Access, so tiering can be proven without a second provider, as decision 0007 requires. Local disk is the hot tier and R2 the offsite tier. Every move copies the bytes, verifies SHA-256, publishes the new copy and retires the old one after a grace period. The last verified copy is never deleted.

See [the backlog index](README.md) for how to pick up and retire items.

## TIER-00 Real R2 compatibility proof (M2)

`P1` · `L` · Proof · Backend

Depends on: none

Blocked on: Your go-ahead for each live run, because it uses paid infrastructure and the agent never handles secret values. On 2026-09-25 you reported the disposable bucket, bucket-scoped key files and `backend/config/application-r2-local.properties` set up, with a web upload through R2 succeeding.

Context: PRs #2, #4 and #5 (merged 2026-09-23) added `backend/scripts/run-r2-proof.sh` with `RealR2CompatibilityProofTest`, closed PostgreSQL fault-test gaps, and documented the manual procedure in local-setup.md. The runner does not kill a real process or measure 128 MiB and concurrent transfers; do those by hand.

**Why.** status.md lists this as the next ordered work. Tiering starts from a provider proven for real.

**Outcome.** Run the decision 0007 compatibility proof against a disposable real R2 bucket, repair any mismatches, and record bounded streaming and recovery evidence.

**Acceptance**

- Covers every scenario listed in storage-and-transfers.md
- Memory, time and concurrency behaviour recorded
- Evidence recorded without secrets

**Invariants:** INV-04, INV-06, INV-07, INV-09, INV-10, INV-15  
**Read:** `docs/decisions/0007-first-cloud-provider-r2.md`, `docs/architecture/storage-and-transfers.md`, `docs/development/local-setup.md`  
**Checks:** `postgres`; Recorded real-bucket run

## TIER-01 Decision: connections, tiers and placement

`P1` · `M` · Decision · Backend, Docs

Depends on: [TIER-00](#tier-00-real-r2-compatibility-proof-m2)

**Why.** Everything in this epic depends on one model.

**Outcome.** A decision record covering StorageConnection records (configured by the operator, secrets by reference) and the definition tier = connection + storage class. It also defines the capability vocabulary (multipart, storage classes, retrieval latency, minimum duration, retrieval fees, egress), placement precedence (workspace default, then folder policy, then explicit move), primary vs replica copies, what clients see (display name and tier label only), and how Archive (TDY-02) maps to placement.

**Acceptance**

- Worked examples: local → R2 Standard → R2 IA
- Explicit about what stays out of scope (no automatic deletion)

**Read:** `docs/product/domain.md`, `docs/architecture/storage-and-transfers.md`  
**Checks:** `decision-review`

## TIER-02 Spike: R2 Infrequent Access behaviour

`P2` · `S` · Spike · Backend

Depends on: none

Blocked on: Needs a disposable Cloudflare R2 bucket and credentials that you set up. That is paid infrastructure, and the agent never handles secret values.

**Why.** R2's own storage classes let us prove tiering with one provider.

**Outcome.** Against a disposable bucket: upload with a storage class, change the class of an existing object (CopyObject vs lifecycle), check minimum-duration and retrieval-fee behaviour, and inspect HEAD metadata. Record facts and prices with dates.

**Acceptance**

- Every claim cites a dated source or an observed call
- Feeds TIER-01 and COST-03

**Checks:** `spike-notes`

## TIER-03 Storage connection registry

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: [TIER-01](#tier-01-decision-connections-tiers-and-placement)

**Why.** Objects need to record which connection holds them before any bytes can move.

**Outcome.** Persisted connections (ID, display name, provider kind, capabilities, secret references) synced from operator config at startup. physical_objects gains a connection ID, backfilled for local objects. Removing a connection that still holds objects makes startup fail safely.

**Acceptance**

- The migration preserves every existing pointer (INV-16)
- The Storage page lists connections and their health
- No secrets in the DTO

**Invariants:** INV-11, INV-16  
**Checks:** `postgres`; `contract`; `web`

## TIER-04 Multiple verified copies per version

`P2` · `L` · Build · Backend

Depends on: [TIER-03](#tier-03-storage-connection-registry)

**Why.** Moving between tiers safely means holding two copies for a while.

**Outcome.** Several StoredObjects per version, each with a verification state, and one primary. Downloads serve the primary and fall back to a healthy replica. Replicas never create logical files.

**Acceptance**

- Fallback is tested with the primary unavailable
- Each committed copy's object identity and key stay immutable (INV-03); changing the primary rewrites no copy
- The primary can only point at a verified copy

**Invariants:** INV-03, INV-04  
**Checks:** `postgres`

## TIER-05 Move bytes between tiers

`P2` · `XL` · Build · Backend

Depends on: [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer), [TIER-04](#tier-04-multiple-verified-copies-per-version)

**Why.** This is the core tiering engine and strong backend evidence for the project.

**Outcome.** A re-tier job copies a version's bytes to the target connection and class, verifies size and SHA-256 there, records the verified copy, switches the primary, and retires the old copy after a grace period. It never deletes the last verified copy, is fenced and restart-safe, works in bulk by folder or batch, and supports progress and cancel.

**Acceptance**

- Crash at every step converges (reuse ENG-08)
- No transaction spans provider I/O
- A stale worker can't retire a newer primary

**Invariants:** INV-03, INV-07, INV-09, INV-10  
**Checks:** `postgres`

## TIER-06 Folder placement policies

`P3` · `M` · Build · Backend, Web · Public API change

Depends on: [TIER-05](#tier-05-move-bytes-between-tiers), [COST-03](cost-and-insight.md#cost-03-decision-cost-estimate-model)

**Why.** 'Photos live on cheap storage' should be a sentence you can say once.

**Outcome.** A policy such as 'new files in /Photos go to R2 · Infrequent Access' applies to new uploads and inherits down the tree. 'Apply to existing' produces a previewed re-tier batch (bytes, estimated cost change, retrieval caveats) that you confirm.

**Acceptance**

- Nothing moves without confirmation
- Policy precedence follows TIER-01

**Checks:** `postgres`; `contract`; `web`; `rendered`

## TIER-07 Design: archive retrieval model

`P3` · `S` · Decision · Backend, Docs

Depends on: [TIER-01](#tier-01-decision-connections-tiers-and-placement)

**Why.** Truly cold tiers (Glacier-style) need a restore request and a wait.

**Outcome.** RestoreRequest states (REQUESTED → RESTORING → READY until T → EXPIRED), UI copy ('Restoring… usually ready in about 12 h'), a cost preview, notification, and how downloads and previews behave for cold objects.

**Acceptance**

- Nothing implemented until a cold provider is chosen

**Checks:** `decision-review`

## TIER-08 Decision: second provider for cold or offsite storage

`P3` · `S` · Decision · Docs

Depends on: [TIER-00](#tier-00-real-r2-compatibility-proof-m2)

**Why.** Decision 0007 says prove one provider first, so this is analysis only.

**Outcome.** Compare AWS S3 Glacier Deep Archive, Backblaze B2 and a second local disk or NAS on restore semantics, egress, API compatibility, minimum durations, credential scoping and test cost.

**Acceptance**

- A recommendation with the evidence needed before building

**Checks:** `decision-review`

## TIER-09 Local hot cache for cloud files

`P3` · `M` · Build · Backend · Fun

Depends on: [TIER-04](#tier-04-multiple-verified-copies-per-version)

**Why.** Repeat downloads and preview generation shouldn't pay a cloud round trip every time.

**Outcome.** A size-bounded LRU cache of recently accessed cloud objects on local disk, digest-verified, with eviction under budget. It is never the only copy.

**Acceptance**

- Cache hits are verified or trusted per a decided rule
- Eviction holds under concurrent reads

**Invariants:** INV-15  
**Checks:** `backend`
