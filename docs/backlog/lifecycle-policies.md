# Configurable file lifecycle policies

Owners should choose storage and retention behavior in the app, understand what will happen, and change their minds before bytes are removed. TIER owns provider connections, verified copies and byte movement. This epic owns versioned policy intent, explanation, previews and safe execution; it does not create a second storage engine.

The missing “strategy” choices are independent: destination, number of verified copies, archive visibility, retrieval class, version retention, trash retention and backup schedule. A preset can combine them, but must show each consequence. Archive is reversible organization; cold storage can delay retrieval; replication is not retained backup; version history is not provider bucket versioning.

Recommended first experience: choose a supported connection, retain versions by default, and show advisory archive suggestions. Later presets such as “Keep local,” “Cloud with local cache,” or “Archive rarely opened files” are visible only when the required capabilities are proven. Costs remain dated estimates. No rule silently changes an existing library when its default is edited.

See [the backlog index](README.md) for pickup, checks and retirement rules.

## POL-01 Decision: policy precedence and lifecycle semantics

`P1` · `M` · Decision · Backend, Docs

Depends on: [ORG-01](organize.md#org-01-decision-how-entries-change), [CFG-11](configurable-shell.md#cfg-11-decision-owner-settings-and-deployment-guardrails)

**Why.** Independent retention and placement controls can contradict each other without one effective-policy model.

**Outcome.** Define typed versioned policy documents, workspace/folder/entry precedence, inheritance, explicit overrides, allowed actions and the boundary between advisory and automatic execution. Align TIER-01 placement when accepted without requiring a live provider to decide retention.

**Acceptance**

- A scenario table covers folder moves, new versions, changed defaults, archived-but-hot files, unavailable providers and retained/pinned versions.
- Destructive retention is opt-in, protects current/pinned/in-use versions and defines a grace period; provider lifecycle rules cannot independently expire managed originals.
- Separate new-upload defaults from applying to existing files; deployment ceilings and backend authorization always win.

**Settle first.** Count/age retention combination, whether overrides travel with moved files, treatment of shared/exported/restoring versions, and policy ownership.

**Invariants:** INV-01, INV-03, INV-04, INV-09, INV-10, INV-13

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `decision-review`

## POL-02 Policy registry and effective-policy explanation

`P2` · `L` · Build · Backend · Public API change

Depends on: [POL-01](#pol-01-decision-policy-precedence-and-lifecycle-semantics), [ORG-11](organize.md#org-11-activity-and-audit-log)

**Why.** A settings screen needs durable policy ownership and a trustworthy explanation.

**Outcome.** Implement typed owner policy create/update/disable and an effective-policy read with inherited source and revision. Start with retention/advisory fields; enable placement fields only with accepted TIER semantics and capability checks.

**Acceptance**

- Concurrent edits use revisions and idempotency; disabled/unsupported actions cannot enter an executable policy.
- An explanation names the controlling folder/workspace override without exposing provider credentials or paths.
- Changes emit one audit event; imported config-managed policies are visibly read-only and never overwritten by app updates.

**Settle first.** Smallest supported policy fields and explicit unknown-version behavior; no arbitrary expression engine.

**Invariants:** INV-01, INV-05, INV-11, INV-16

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`

## POL-03 Dry-run policy planner

`P2` · `L` · Build · Backend · Public API change

Depends on: [POL-02](#pol-02-policy-registry-and-effective-policy-explanation), [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer)

**Why.** A count alone is insufficient consent for changing a library.

**Outcome.** Produce bounded durable previews listing eligible/protected/skipped files, reasons, retained versions, bytes and required provider actions. Bind the preview to policy revision and candidate revisions; add dated cost estimates when COST-03 exists.

**Acceptance**

- A file changed after preview is skipped or replanned, never silently acted on.
- Counts distinguish logical bytes, replica bytes, reclaimable bytes and estimates; no invented savings before provider deletion is confirmed.
- Large previews page and resume after restart; cancellation stops planning without mutating files.

**Settle first.** Preview lifetime, batch cap and stale-candidate policy; size gates must be chosen before measuring.

**Invariants:** INV-01, INV-09, INV-10, INV-14, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`

## POL-04 Storage and retention strategy editor

`P2` · `M` · Build · Web

Depends on: [POL-03](#pol-03-dry-run-policy-planner), [CFG-09](configurable-shell.md#cfg-09-runtime-ui-capabilities-api), [LIB-16](everyday-library.md#lib-16-storage-summary-and-explanatory-panels)

**Why.** An owner should set file behavior without editing YAML.

**Outcome.** Add an app settings editor with plain-language presets, inheritance breadcrumbs, per-field explanations and a concrete dry-run review. New-upload default destination uses TIER-13/14 once available; disabled capabilities explain what is missing.

**Acceptance**

- Show “affects future files” versus “review existing files” explicitly; Save alone cannot delete or migrate bytes.
- Retention age/count, pinned-version exceptions and archive retrieval tradeoffs are understandable without provider terminology.
- Conflicts retain edits; Reset shows inherited values; a phone user can inspect affected files before confirming.

**Settle first.** Initial presets supported by POL-02; do not display speculative working controls.

**Invariants:** INV-01, INV-14

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `web`; `rendered`

## POL-05 Version retention with pins and safe collection

`P2` · `L` · Build · Backend, Web · Public API change

Depends on: [POL-03](#pol-03-dry-run-policy-planner), [ORG-07](organize.md#org-07-version-history), [ORG-05](organize.md#org-05-permanent-deletion-and-object-garbage-collection)

**Why.** Versioning is incomplete without control over what is retained and reclaimed.

**Outcome.** Implement pin/unpin and explicitly confirmed retention runs through the existing tombstone/garbage-collection mechanism. Keep pruning version records separate from retiring redundant copies.

**Acceptance**

- Current, pinned and protected versions survive every age/count combination and concurrent restore/upload.
- Recheck protection immediately before collection; stale workers and retries cannot delete newly protected content.
- Restart after catalog retirement resumes object deletion; failed deletion reports pending reclamation, not freed bytes.
- A grace window permits cancelling pending deletion; once physically deleted, the UI cannot promise undo.

**Settle first.** Protection set and grace period from POL-01; split pin API, planner integration and collection at pickup.

**Invariants:** INV-03, INV-04, INV-07, INV-09, INV-10, INV-13

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; `web`; `rendered`

## POL-06 Scheduled archive and placement policies

`P3` · `L` · Build · Backend, Web · Public API change

Depends on: [POL-03](#pol-03-dry-run-policy-planner), [POL-04](#pol-04-storage-and-retention-strategy-editor), [COST-06](cost-and-insight.md#cost-06-advisory-archival-rules-m5), [TIER-06](storage-tiers.md#tier-06-folder-placement-policies), [TDY-02](tidy-mode.md#tdy-02-archived-state-and-archive-view)

**Why.** Advisory rules can later become controlled automation once their effects are proven.

**Outcome.** Allow explicit opt-in schedules for logical archive and verified placement, using the policy planner and existing TIER jobs. Start with non-destructive actions; retention deletion remains POL-05 with its separate consent semantics.

**Acceptance**

- Dry-run is the default; per-run limits, pause, next-run preview and failure history are visible.
- Policy edits fence queued work; outage/retry cannot multiply moves; never retire the last verified copy.
- Archive can be undone independently of physical retrieval time; cost/retrieval caveats appear before enabling a schedule.

**Settle first.** Timezone, missed-run behavior, budgets and automatic-action allow-list.

**Invariants:** INV-04, INV-07, INV-09, INV-10, INV-14

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; `web`; `rendered`

## POL-07 Archive retrieval and restore queue

`P3` · `L` · Build · Backend, Web · Public API change

Depends on: [TIER-07](storage-tiers.md#tier-07-design-archive-retrieval-model), [TIER-08](storage-tiers.md#tier-08-decision-second-provider-for-cold-or-offsite-storage), [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer)

**Why.** A cold-storage selection must come with a way to get the file back.

**Outcome.** For the selected and separately proven cold provider, implement durable restore requests, readiness/expiry and a user-visible queue with estimated latency and cost. Split provider proof from backend/UI implementation at pickup.

**Acceptance**

- Repeated requests reuse compatible in-flight retrieval; restart reconciles uncertain provider state.
- Download distinguishes restoring, available-until and failed; previews explain cold originals without triggering surprise retrieval costs.
- Cancellation semantics reflect provider reality; unsupported cancellation never claims a refund or stopped restore.

**Settle first.** Actual selected provider and authorized live proof; no implementation before capability/credential prerequisites are met.

**Invariants:** INV-01, INV-07, INV-09, INV-10, INV-14

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; `web`; `rendered`; separately authorized live-provider proof
