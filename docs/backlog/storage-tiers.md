# Storage tiers & placement

Files stay where they are in the library while their bytes move between hot, cool and cold storage. Each move is verified before it takes effect and the old copy is retired afterwards.

Placement is what sets Filebonsai apart. A tier is a storage connection plus a storage class. R2 alone offers Standard and Infrequent Access, so tiering can be proven without a second provider, as decision 0007 requires. Local disk is the hot tier and R2 the offsite tier. Every move copies the bytes, verifies SHA-256, publishes the new copy and retires the old one after a grace period. The last verified copy is never deleted.

See [the backlog index](README.md) for how to pick up and retire items.

## Proposed connection setup direction

Support both configuration-managed and app-managed connections, with one explicit
owner per record. Keep Spring properties for deployment bootstrap and guardrails;
make the app the ordinary owner workflow for adding an already provisioned R2 bucket.
This is a recommendation for TIER-10, not an accepted change to the M1 read-only
Storage page or decision 0007's transfer boundary.

| Concern | Recommended home |
| --- | --- |
| Database, local data roots, endpoint policy, encryption-root delivery and resource ceilings | Operator configuration and secret mounts |
| Optional declarative connections | Operator config with stable IDs and server-side secret references; visibly managed by configuration in the app |
| App-managed connection names, provider metadata, lifecycle and workspace assignments | PostgreSQL registry, changed through owner-only typed operations |
| Provider credentials entered during setup/rotation | Write-only administrative submission to a server secret store; never a normal response or a UI preference |
| Layout, density, panel visibility and personal view defaults | CFG-04 preferences; no effect on storage authorization |

For R2's S3 API the credentials are an **Access Key ID and Secret Access Key**, not
the Authentik/OIDC application client secret. Use bucket-scoped
Object Read & Write credentials, which Cloudflare supports for this access pattern; the server remains the S3
client. R2 also supports temporary credentials derived from a parent credential;
that does not remove the server's credential custody requirement. Sources checked
2026-09-26: [R2 authentication](https://developers.cloudflare.com/r2/api/tokens/) and
[temporary credentials](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/).

Recommended first release: an owner enters the key once over HTTPS, Filebonsai stores
it encrypted with the root key supplied separately from PostgreSQL, and later screens
show only credential status and rotation actions. Keep a secret-file/secret-manager
mode for operators who do not want to submit keys through a browser. The server must
recover the credential to sign requests, so password hashing is not a storage option.
Encryption at rest does not protect against a compromised running server; the threat
model must also cover browser/XSS exposure during entry, backups, logging and key
recovery. These are design proposals informed by
[OWASP secret-management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html).

TIER-10 can settle custody and ownership before the live R2 proof. The registry and
local tests can follow that decision; enabling app-managed R2 still depends on
TIER-00. Tiering and a second provider retain their existing proof gates.

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

Depends on: [TIER-00](#tier-00-real-r2-compatibility-proof-m2), [TIER-10](#tier-10-decision-secure-app-managed-connections)

**Why.** Everything in this epic depends on one model.

**Outcome.** A decision record extending TIER-10's connection ownership model with tier = connection + storage class. It defines the capability vocabulary (multipart, storage classes, retrieval latency, minimum duration, retrieval fees, egress), placement precedence (workspace default, then folder policy, then explicit move), primary vs replica copies, what ordinary clients see (display name and tier label only), and how Archive (TDY-02) maps to placement. Secrets remain private references; this decision does not duplicate credential custody or setup APIs.

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

`P2` · `L` · Build · Backend · Public API change

Depends on: [TIER-10](#tier-10-decision-secure-app-managed-connections)

**Why.** Objects need to record which connection holds them before any bytes can move.

**Outcome.** Persisted stable connection IDs, provider kind, display name, management source, revision, lifecycle and workspace assignment, with private credential references. Import existing configuration idempotently; configuration reconciliation touches only config-managed records and never overwrites app-managed ones. Backfill existing local and R2 objects and nonterminal transfer attempts from their durable provider identities. Split migration/import and read API work at pickup; runtime routing is TIER-14.

**Acceptance**

- The migration preserves every existing pointer, including R2 publication/recovery state; ambiguous legacy ownership requires explicit operator mapping instead of guessing from the current default provider
- Repeated startup never duplicates IDs; removing config with referenced objects/transfers fails safely or marks the connection unavailable under the accepted decision, never deletes or repoints bytes
- A scoped read API exposes approved display metadata, management source, lifecycle and last-check state; an untested connection is not healthy merely because it is configured
- Ordinary responses retain the storage-summary privacy boundary: no account, bucket, endpoint, path, secret reference, key material or provider upload IDs
- PostgreSQL tests cover fresh/upgrade migration, repeated import, two-workspace isolation and missing provider/secret dependencies; no provider I/O inside migration/catalog transactions

**Invariants:** INV-01, INV-07, INV-10, INV-11, INV-16

**Checks:** `postgres`; `contract`

## TIER-04 Multiple verified copies per version

`P2` · `L` · Build · Backend

Depends on: [TIER-03](#tier-03-storage-connection-registry), [TIER-01](#tier-01-decision-connections-tiers-and-placement), [TIER-14](#tier-14-activate-rotate-and-retire-connections-safely)

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

## TIER-10 Decision: secure app-managed connections

`P1` · `M` · Decision · Backend, Web, Docs

Depends on: none

**Why.** The current Spring-only publisher and read-only Storage page cannot support adding a backend in the app. Credential custody, operator authority and migration need an explicit decision before an editor is built.

**Outcome.** A proposed decision adopting or revising the hybrid model above, covering connection ownership, privileged input boundaries, secret storage, reauthentication, lifecycle, compatibility and recovery. Keep one logical connection registry with distinct config-managed/app-managed records, rather than two settings sources competing at startup.

**Acceptance**

- Define server-owner administration separately from workspace membership; a connection assignment never lets a member read/replace its credential or assign it to another workspace
- Specify any transfer of management ownership as explicit and revision-checked; config may provide defaults or enforced constraints, never silently win over an app-owned record
- Choose the initial secret store: authenticated encryption of credential records with a versioned root key mounted separately from the database is the recommended self-hosted default; retain private secret-file/manager references as an alternative
- Define root-key creation/delivery, backup, rotation and lost-key behavior; never derive it from the owner password, store it alongside ciphertext in a database backup or silently generate a replacement on restart
- Resolve the current INV-11 wording, which forbids credentials in DTOs, before implementation: propose a narrow exception for dedicated write-only administrative request bodies while preserving the ban on secret-bearing responses, logs and evidence. Update the active invariant/API/design docs only through the accepted decision
- Define recent owner reauthentication for local-owner and Authentik sessions, server-enforced freshness and CSRF; do not imply that existing session cookies already prove recent authentication
- R2 setup accepts validated account ID, jurisdiction and bucket metadata; the server derives the approved HTTPS endpoint. No arbitrary URL, filesystem root, caller-supplied secret path or Cloudflare account-management token
- Decide which non-secret provider fields, if any, an owner-only editing response may return; ordinary `/storage` and entry DTOs retain their existing privacy guarantees
- Threat-model stored/reflected XSS during key entry, request/APM logging, SSRF, backup theft, concurrent edits, stolen sessions and server compromise; define a release gate using TIER-15
- Draft APIs remain unavailable by default until the security proof; no live provider use, paid provisioning or accepted security-policy changes happen in this decision task

**Read:** `docs/decisions/0007-first-cloud-provider-r2.md`, `docs/architecture/storage-and-transfers.md`, `docs/product/invariants.md`, `docs/api/conventions.md`

**Checks:** `decision-review`; fresh read-only security/persistence review of the proposal

## TIER-11 Server credential custody

`P2` · `M` · Build · Backend

Depends on: [TIER-10](#tier-10-decision-secure-app-managed-connections), [TIER-03](#tier-03-storage-connection-registry)

**Why.** The app can accept a key only when persistence, logging and recovery treat it as a secret throughout its lifecycle.

**Outcome.** Implement the chosen credential-store adapter and private resolver. For the encrypted database option, use a maintained cryptographic implementation with authenticated encryption, unique nonces, key versions and binding to connection/credential identity. Store only ciphertext and safe metadata in PostgreSQL; the root key comes from an operator-controlled mount or secret service.

**Acceptance**

- Copying ciphertext to another connection fails authentication; missing/wrong keys and tampered records fail closed with a safe error and no plaintext fallback
- Cleartext keys never appear in DTO responses, generated examples, exception/toString output, request logs, traces, metrics, audit events, URLs or database plaintext; test with synthetic canary secrets
- External secret references are server-provisioned handles, not arbitrary file paths accepted from browser input; resolution is private and scoped
- Provider-credential rotation and encryption-root rotation are distinct; old key versions remain recoverable during an interrupted re-encryption, with bounded secret caching and explicit invalidation
- Document separate backup/recovery of key material and encrypted records; losing the root key produces a recoverable administrative state requiring restore/re-entry, never silent loss of connection identity
- Secret-manager or filesystem resolution happens outside database transactions; prove restart behavior with PostgreSQL and a synthetic secret source

**Invariants:** INV-07, INV-11 (as revised by the accepted decision), INV-13

**Checks:** `postgres`; secret non-disclosure tests; fresh read-only persistence/security review

## TIER-12 Owner connection drafts and safe probes

`P2` · `L` · Build · Backend · Public API change

Depends on: [TIER-03](#tier-03-storage-connection-registry), [TIER-11](#tier-11-server-credential-custody)

**Why.** Setup needs a bounded way to validate credentials and save a connection without prematurely routing uploads to it.

**Outcome.** Typed owner operations to create/read/update/discard a draft and explicitly test it. Keep credentials in a dedicated write-only request shape with omission/replacement semantics, bounded retention for abandoned drafts and a safe status response. Split administration and probe execution at pickup; activation and active-connection rotation belong to TIER-14.

**Acceptance**

- Enforce owner role, current workspace/assignment scope, recent reauthentication, CSRF, request size/rate limits and revision checks; direct requests cannot bypass UI restrictions
- Create uses scoped idempotency; a lost response can be resolved by a safe operation ID without returning/reposting a key. Do not persist plaintext credential bodies or a guessable digest of them in idempotency records
- Probe result is tied to the exact metadata/credential revision and a defined freshness window; editing a draft invalidates a prior pass, and late probe results cannot validate a newer revision
- The probe writes/reads/digest-verifies/deletes only generated synthetic objects under its owned prefix; if multipart permission is claimed, test create/part/list/abort too. No bucket-wide cleanup, bucket creation or account administration
- Bound duration, bytes, concurrency and frequency; show the owner that a probe uses provider requests and small temporary objects. Permission failure, timeout and uncertain cleanup have safe distinct outcomes with durable cleanup ownership
- Derive/allow-list provider destinations, reject malformed identifiers, forbid redirects and enforce network egress restrictions against private/link-local/metadata destinations; no arbitrary endpoint field. Follow the [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- Record actor, operation, opaque connection ID, outcome and correlation without credentials, bucket/account/path or raw provider errors; no provider I/O in a database transaction
- A successful probe establishes only the operations tested at that time, not the exact maximum scope of the supplied key or full R2 compatibility; live tests require a separately authorized disposable bucket

**Invariants:** INV-01, INV-05, INV-07, INV-09, INV-10, INV-11, INV-15

**Checks:** `postgres`; `contract`; synthetic provider fault and SSRF tests; fresh read-only contract/persistence review

## TIER-13 Add storage from the app

`P2` · `M` · Build · Web

Depends on: [TIER-12](#tier-12-owner-connection-drafts-and-safe-probes), [TIER-14](#tier-14-activate-rotate-and-retire-connections-safely), [CFG-09](configurable-shell.md#cfg-09-runtime-ui-capabilities-api), [LIB-16](everyday-library.md#lib-16-storage-summary-and-explanatory-panels)

**Why.** The owner should be able to connect storage without editing application properties or restarting the server for each connection.

**Outcome.** An owner-only Add connection flow: choose a supported provider, name the connection, enter scoped credentials/approved metadata, test, review and activate, then optionally make it the destination for new uploads. First scope is an existing R2 bucket; local storage is selected only from operator-provisioned roots. The installed capability response decides which choices exist.

**Acceptance**

- Explain where to create bucket-scoped R2 Object Read & Write credentials, using Access Key ID/Secret Access Key labels; no request for the Cloudflare login, global API key or Authentik secret
- Render secrets masked during entry, support paste, and never offer retrieval after saving; replacement is a separate action. No credential state in local/session storage, URLs, analytics, session replay or persistent form caches
- Clear secret fields on success, cancel, navigation and reauthentication expiry; failed requests retain safe metadata and request re-entry only when needed. Do not claim JavaScript memory is securely zeroed
- Recent reauthentication completes before secret entry; configuration-managed connections show their source and restricted actions; non-owners receive safe summaries and cannot invoke management APIs
- Loading, validation, testing, credential rejection, rate limit, timeout, uncertain cleanup, stale revision and save/activation failure each give a specific next step; Save is never represented as activation
- Review states the destination effect: existing files stay on their current connections; a new default applies only to new uploads. Setting a default is explicit, not a side effect of adding a connection
- Render the full flow with synthetic values at desktop/phone sizes, keyboard-only, 200% zoom and reduced motion; exclude secret fields from screenshots and traces

**Invariants:** INV-01, INV-11, INV-14

**Checks:** `web`; `rendered`; synthetic secret non-disclosure inspection

## TIER-14 Activate, rotate and retire connections safely

`P2` · `L` · Build · Backend · Public API change

Depends on: [TIER-12](#tier-12-owner-connection-drafts-and-safe-probes), [TIER-00](#tier-00-real-r2-compatibility-proof-m2)

**Why.** Replacing a singleton Spring publisher with multiple connections must not redirect an old download or strand an in-flight upload.

**Outcome.** Resolve publishers by durable connection ID; add guarded activate/default, credential-rotation, disable-for-new-writes and retirement operations. Treat provider/account/bucket/local-root identity as immutable once referenced. Metadata rename, credential replacement for the same destination and moving stored bytes are different operations. Split routing/default changes from rotation/retirement at pickup.

**Acceptance**

- Activation requires a recent passing probe for the current revision; begin-upload pins the connection and validated credential generation/routing context durably. Changing the workspace default affects only later begins
- Downloads, finalization, cancellation, orphan cleanup and restart recovery resolve the connection recorded with the object/attempt, never the current default; concurrent default changes cannot split one attempt across buckets
- Stage and test replacement credentials before an atomic switch; retain old credential availability while pinned work drains, or explicitly suspend/reconcile it if the old key was revoked. Never retire a key still required for recovery
- Disabling prevents new writes while preserving reads/reconciliation where credentials work; revoked credentials have a visible degraded state and cannot cause an upload to be declared available without verification
- Removal is blocked by stored copies, active attempts, pending cleanup, default/policy references or unresolved outcomes. Retiring a connection does not delete provider objects or revoke keys silently; moving bytes uses TIER-05
- Duplicate submissions and concurrent edits are revision/idempotency safe; a missing config-managed connection cannot be recreated under another destination with the same identity
- Test PostgreSQL restart/fault cases with two connections, uploads begun before/after a default switch, rotation during multipart/finalization, removal races and provider I/O blocked outside a transaction

**Invariants:** INV-01, INV-03, INV-04, INV-07, INV-09, INV-10, INV-11, INV-16

**Checks:** `postgres`; `contract`; fresh read-only contract/persistence review

## TIER-15 Storage administration security and recovery proof

`P1` · `M` · Proof · Backend, Web

Depends on: [TIER-13](#tier-13-add-storage-from-the-app), [TIER-14](#tier-14-activate-rotate-and-retire-connections-safely)

**Why.** App-managed credentials expand the trusted input surface and need evidence before the feature is enabled for ordinary use.

**Outcome.** Prove the TIER-10 threat model and recovery contract with synthetic secrets, PostgreSQL and controlled provider fixtures. Record remaining limits explicitly; perform a disposable live onboarding/rotation drill only with separate user authorization.

**Acceptance**

- Deny anonymous, member/non-owner, cross-workspace, stale-reauth and invalid-CSRF mutations; test direct APIs as well as hidden/disabled UI controls
- Inspect responses, generated fixtures, logs, traces, audit records, request capture and browser persistence for canary key leakage; inject hostile display names and provider errors
- Prove malformed destination/redirect/private-address rejection, bounded probes, revision races, interrupted cleanup and rate limits without contacting real internal targets
- Restore encrypted configuration plus separately backed-up keys into a disposable installation; verify existing file downloads and nonterminal recovery; wrong/missing keys fail safely
- Exercise default switching, credential replacement/revocation and blocked retirement while work is in flight; record exactly which cases use fixtures and which use a real provider
- Fresh read-only contract and persistence/security reviews have no blocking findings; enablement documentation states server/browser trust limits and key-loss recovery rather than promising absolute security

**Invariants:** INV-01, INV-03, INV-04, INV-07, INV-09, INV-10, INV-11, INV-13, INV-14

**Checks:** `postgres`; `contract`; `web`; `rendered`; recorded recovery/security evidence
