# Backlog

Candidate work for Filebonsai, grouped by epic. These items are candidates, not commitments.
[`../development/status.md`](../development/status.md) remains the only record of observed
state, work in progress and committed order. Decision
[0008](../decisions/0008-checked-in-backlog.md) defines how the two relate.

Each item states an outcome, acceptance criteria, dependencies, open questions, the invariants
it must evidence, and its checks. It is not an implementation plan. The bounded task packet is
still written when the work starts, as decision 0006 requires.

## Picking up an item

1. Choose an item whose **Depends on** keys no longer appear in this backlog (removed means
   done) and that has no **Blocked on** line. Prefer `P1`, then `P2`. `P3` covers later work
   and the fun extras. If an **In flight** line names an unmerged branch, start from that
   branch or confirm its status first.
2. Read `AGENTS.md`, `docs/README.md` and `docs/development/status.md`, then the item's
   **Read** list. Use the `filebonsai-task` skill. For items marked *Public API change*, also
   use `filebonsai-api-contract`.
3. Resolve the **Settle first** questions. Ask the user when an answer materially changes the
   solution.
4. When the work starts, add it to the ordered work in `status.md`. State the outcome, owned
   paths, dependencies, acceptance criteria and checks before editing. Propose a split for
   `L` and `XL` items.
5. The deliverable depends on the kind:
   - **Build:** the change, its tests, and observed checks.
   - **Decision:** a proposed record under `docs/decisions/` (next free number,
     `Status: proposed`) plus the doc updates it implies. No implementation. Stop for review.
   - **Proof:** observed evidence recorded in `status.md`, with repairs kept bounded. Stop if
     a repair would change the public API.
   - **Spike:** dated, sourced findings and a recommendation. Keep experiments out of the
     main code paths.
6. When the item is done, delete it from its epic file and from the index below, in the same
   change that records observed results in `status.md`. Git keeps the history. Deliver the
   change through a pull request, as `AGENTS.md` describes.

## Changing the backlog

- Add items with the next unused key in their epic, and never reuse a removed key. Keep the
  same fields: outcome, acceptance, dependencies, open questions, invariants and checks.
- Edit an item's text only as part of the task that works on it, or of a deliberate backlog
  change. Avoid bulk rewrites on parallel branches.
- An item removed for any reason other than completion (dropped, split or merged) is removed
  in the same change that updates every item depending on it. Search the backlog for its key
  first, then drop that dependency or point it at the item that now covers the need. A
  dependent left pointing at a removed key would look ready, because removed means done.
  The reason goes in the commit message. No "dropped" section.

## Vocabulary

| Term | Meaning |
| --- | --- |
| `P1` / `P2` / `P3` | Start here / next / later and fun extras. Advisory only. `status.md` holds the committed order. |
| `S` / `M` / `L` / `XL` | One short session / one focused session / several sessions, split at pickup / an epic slice that must be split. |
| Build, Decision, Proof, Spike | See step 5 above. |
| Blocked on | Needs something only the user can provide, such as paid infrastructure or lifting a deferral. |
| In flight | Related work exists on an unmerged branch. |

| Check | Command or evidence |
| --- | --- |
| `web` | `cd web && npm test && npm run typecheck:run && npm run build` |
| `rendered` | Rendered inspection at 1440×900 and 390×844 against the real PostgreSQL-profile backend |
| `contract` | `cd backend && ./mvnw test`, then `./scripts/verify.sh` once and inspect the OpenAPI diff, as `filebonsai-api-contract` prescribes; read-only contract-reviewer pass |
| `postgres` | Targeted PostgreSQL Testcontainers tests, then `cd backend && ./mvnw spotless:apply test -q` once; read-only persistence-reviewer pass |
| `backend` | Targeted backend tests, then `cd backend && ./mvnw spotless:apply test -q` once |
| `decision-review` | No code changes; the user reviews the proposed record |
| `spike-notes` | Findings recorded with dates and sources; throwaway code stays out of main paths |

## Index

### [Finish M1](finish-m1.md)

M1 promises that a clean checkout becomes a working, recoverable library. Close the gaps before stacking features on it.

| Item | Kind | Priority | Size | Depends on |
| --- | --- | --- | --- | --- |
| [M1-01](finish-m1.md#m1-01-map-m1-failure-outcomes-in-the-web-client) Map M1 failure outcomes in the web client | Build | P1 | M | none |
| [M1-02](finish-m1.md#m1-02-breadcrumbs-from-real-ancestors) Breadcrumbs from real ancestors | Build | P1 | M | none |
| [M1-03](finish-m1.md#m1-03-rediscover-and-cancel-open-uploads) Rediscover and cancel open uploads | Build | P1 | L | none |
| [M1-04](finish-m1.md#m1-04-expose-upload-limits-for-client-preflight) Expose upload limits for client preflight | Build | P1 | S | none |
| [M1-05](finish-m1.md#m1-05-prove-interruption-and-restart-recovery-in-the-browser) Prove interruption and restart recovery in the browser | Proof | P1 | M | none |
| [M1-06](finish-m1.md#m1-06-prove-second-principal-isolation-over-http) Prove second-principal isolation over HTTP | Proof | P1 | M | none |
| [M1-07](finish-m1.md#m1-07-container-image-and-compose-from-a-clean-checkout) Container image and Compose from a clean checkout (in flight) | Build | P1 | L | [M1-08](finish-m1.md#m1-08-serve-the-web-app-from-the-backend-at-one-origin) |
| [M1-08](finish-m1.md#m1-08-serve-the-web-app-from-the-backend-at-one-origin) Serve the web app from the backend at one origin (in flight) | Build | P1 | M | none |
| [M1-09](finish-m1.md#m1-09-read-only-storage-page) Read-only Storage page | Build | P1 | M | [M1-04](finish-m1.md#m1-04-expose-upload-limits-for-client-preflight) |
| [M1-10](finish-m1.md#m1-10-honest-determinate-upload-progress) Honest determinate upload progress | Build | P2 | S | none |
| [M1-11](finish-m1.md#m1-11-drag-and-drop-upload) Drag-and-drop upload | Build | P2 | S | none |
| [M1-12](finish-m1.md#m1-12-m1-exit-review) M1 exit review | Proof | P1 | M | [M1-01](finish-m1.md#m1-01-map-m1-failure-outcomes-in-the-web-client), [M1-02](finish-m1.md#m1-02-breadcrumbs-from-real-ancestors), [M1-03](finish-m1.md#m1-03-rediscover-and-cancel-open-uploads), [M1-05](finish-m1.md#m1-05-prove-interruption-and-restart-recovery-in-the-browser), [M1-06](finish-m1.md#m1-06-prove-second-principal-isolation-over-http), [M1-07](finish-m1.md#m1-07-container-image-and-compose-from-a-clean-checkout), [M1-09](finish-m1.md#m1-09-read-only-storage-page) |

### [Foundations](foundations.md)

Harnesses that make every later slice cheaper to prove.

| Item | Kind | Priority | Size | Depends on |
| --- | --- | --- | --- | --- |
| [ENG-01](foundations.md#eng-01-web-ci-and-contract-drift-checks) Web CI and contract drift checks | Build | P1 | S | none |
| [ENG-02](foundations.md#eng-02-playwright-end-to-end-harness) Playwright end-to-end harness | Build | P1 | M | none |
| [ENG-03](foundations.md#eng-03-synthetic-demo-library-generator) Synthetic demo library generator | Build | P2 | S | none |
| [ENG-04](foundations.md#eng-04-decision-durable-jobs-and-outbox) Decision: durable jobs and outbox | Decision | P1 | S | none |
| [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer) Job runner with a first consumer | Build | P1 | L | [ENG-04](foundations.md#eng-04-decision-durable-jobs-and-outbox) |
| [ENG-06](foundations.md#eng-06-architecture-tests) Architecture tests | Build | P2 | S | none |
| [ENG-07](foundations.md#eng-07-property-based-tests-for-names-and-upload-states) Property-based tests for names and upload states | Build | P2 | M | none |
| [ENG-08](foundations.md#eng-08-crash-injection-harness-for-transfers) Crash-injection harness for transfers | Build | P2 | L | none |
| [ENG-09](foundations.md#eng-09-observability-baseline) Observability baseline | Build | P2 | M | none |
| [ENG-10](foundations.md#eng-10-measured-resource-baselines-for-transfers) Measured resource baselines for transfers (in flight) | Proof | P2 | M | none |
| [ENG-11](foundations.md#eng-11-migration-upgrade-test-harness) Migration upgrade test harness | Build | P2 | M | none |

### [Everyday library](everyday-library.md)

Make the daily loop of finding, looking and acting feel like the design direction: calm, dense and keyboard-first.

| Item | Kind | Priority | Size | Depends on |
| --- | --- | --- | --- | --- |
| [LIB-01](everyday-library.md#lib-01-design-tokens-and-shell-foundation) Design tokens and shell foundation | Build | P1 | M | none |
| [LIB-02](everyday-library.md#lib-02-folder-tree-sidebar) Folder tree sidebar | Build | P2 | M | [LIB-01](everyday-library.md#lib-01-design-tokens-and-shell-foundation) |
| [LIB-03](everyday-library.md#lib-03-server-side-sort-for-folder-listings) Server-side sort for folder listings | Build | P2 | M | none |
| [LIB-04](everyday-library.md#lib-04-table-and-grid-views) Table and grid views | Build | P2 | M | [LIB-01](everyday-library.md#lib-01-design-tokens-and-shell-foundation), [LIB-03](everyday-library.md#lib-03-server-side-sort-for-folder-listings) |
| [LIB-05](everyday-library.md#lib-05-selection-model) Selection model | Build | P2 | M | none |
| [LIB-06](everyday-library.md#lib-06-inspector-panel) Inspector panel | Build | P2 | M | [LIB-01](everyday-library.md#lib-01-design-tokens-and-shell-foundation) |
| [LIB-07](everyday-library.md#lib-07-name-search) Name search | Build | P2 | M | [M1-02](finish-m1.md#m1-02-breadcrumbs-from-real-ancestors) |
| [LIB-08](everyday-library.md#lib-08-command-palette-and-keyboard-shortcuts) Command palette and keyboard shortcuts | Build | P2 | M | [LIB-01](everyday-library.md#lib-01-design-tokens-and-shell-foundation) |
| [LIB-09](everyday-library.md#lib-09-starred-and-recent) Starred and Recent | Build | P2 | M | none |
| [LIB-10](everyday-library.md#lib-10-mobile-layout-pass) Mobile layout pass | Build | P2 | M | [LIB-01](everyday-library.md#lib-01-design-tokens-and-shell-foundation) |
| [LIB-11](everyday-library.md#lib-11-large-folder-performance) Large-folder performance | Proof | P3 | M | [ENG-03](foundations.md#eng-03-synthetic-demo-library-generator) |
| [LIB-12](everyday-library.md#lib-12-accessibility-audit-and-fixes) Accessibility audit and fixes | Build | P2 | M | [ENG-02](foundations.md#eng-02-playwright-end-to-end-harness) |
| [LIB-13](everyday-library.md#lib-13-warm-dark-theme) Warm dark theme | Build | P3 | S | [LIB-01](everyday-library.md#lib-01-design-tokens-and-shell-foundation) |

### [Organize](organize.md)

Rename, move, trash, versions and tags. Every change is metadata, reversible where possible, and audited.

| Item | Kind | Priority | Size | Depends on |
| --- | --- | --- | --- | --- |
| [ORG-01](organize.md#org-01-decision-how-entries-change) Decision: how entries change | Decision | P1 | S | none |
| [ORG-02](organize.md#org-02-rename) Rename | Build | P1 | M | [ORG-01](organize.md#org-01-decision-how-entries-change) |
| [ORG-03](organize.md#org-03-move) Move | Build | P1 | L | [ORG-01](organize.md#org-01-decision-how-entries-change), [LIB-05](everyday-library.md#lib-05-selection-model) |
| [ORG-04](organize.md#org-04-trash-and-restore) Trash and restore | Build | P1 | L | [ORG-01](organize.md#org-01-decision-how-entries-change) |
| [ORG-05](organize.md#org-05-permanent-deletion-and-object-garbage-collection) Permanent deletion and object garbage collection | Build | P2 | L | [ORG-04](organize.md#org-04-trash-and-restore), [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer) |
| [ORG-06](organize.md#org-06-upload-a-new-version-of-a-file) Upload a new version of a file | Build | P2 | L | [ORG-01](organize.md#org-01-decision-how-entries-change) |
| [ORG-07](organize.md#org-07-version-history) Version history | Build | P2 | M | [ORG-06](organize.md#org-06-upload-a-new-version-of-a-file), [LIB-06](everyday-library.md#lib-06-inspector-panel) |
| [ORG-08](organize.md#org-08-tags) Tags | Build | P2 | M | [LIB-06](everyday-library.md#lib-06-inspector-panel) |
| [ORG-09](organize.md#org-09-download-a-folder-as-zip) Download a folder as ZIP | Build | P2 | M | none |
| [ORG-10](organize.md#org-10-duplicate-finder) Duplicate finder | Build | P2 | M | none |
| [ORG-11](organize.md#org-11-activity-and-audit-log) Activity and audit log | Build | P2 | M | [ORG-01](organize.md#org-01-decision-how-entries-change) |
| [ORG-12](organize.md#org-12-undo-for-reversible-actions) Undo for reversible actions | Build | P3 | S | [ORG-02](organize.md#org-02-rename), [ORG-03](organize.md#org-03-move), [ORG-04](organize.md#org-04-trash-and-restore) |
| [ORG-13](organize.md#org-13-file-notes) File notes | Build | P3 | S | [LIB-06](everyday-library.md#lib-06-inspector-panel) |

### [Previews & media](previews-and-media.md)

See a file before downloading it. Derived assets inherit authorization and never block the original.

| Item | Kind | Priority | Size | Depends on |
| --- | --- | --- | --- | --- |
| [PRV-01](previews-and-media.md#prv-01-decision-preview-processing-sandbox) Decision: preview processing sandbox | Decision | P2 | S | none |
| [PRV-02](previews-and-media.md#prv-02-image-thumbnail-pipeline) Image thumbnail pipeline | Build | P2 | L | [PRV-01](previews-and-media.md#prv-01-decision-preview-processing-sandbox), [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer) |
| [PRV-03](previews-and-media.md#prv-03-gallery-grid-and-lightbox) Gallery grid and lightbox | Build | P2 | M | [PRV-02](previews-and-media.md#prv-02-image-thumbnail-pipeline), [LIB-04](everyday-library.md#lib-04-table-and-grid-views) |
| [PRV-04](previews-and-media.md#prv-04-photo-metadata-extraction) Photo metadata extraction | Build | P3 | M | [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer), [PRV-01](previews-and-media.md#prv-01-decision-preview-processing-sandbox) |
| [PRV-05](previews-and-media.md#prv-05-text-markdown-and-pdf-previews) Text, Markdown and PDF previews | Build | P3 | M | [PRV-01](previews-and-media.md#prv-01-decision-preview-processing-sandbox) |
| [PRV-06](previews-and-media.md#prv-06-video-posters-and-range-downloads) Video posters and range downloads | Build | P3 | L | [PRV-02](previews-and-media.md#prv-02-image-thumbnail-pipeline) |
| [PRV-07](previews-and-media.md#prv-07-on-this-day) On this day | Build | P3 | S | [PRV-04](previews-and-media.md#prv-04-photo-metadata-extraction), [PRV-03](previews-and-media.md#prv-03-gallery-grid-and-lightbox) |
| [PRV-08](previews-and-media.md#prv-08-spike-map-of-geotagged-photos) Spike: map of geotagged photos | Spike | P3 | S | [PRV-04](previews-and-media.md#prv-04-photo-metadata-extraction) |

### [Tidy mode](tidy-mode.md)

Swipe through files one card at a time and decide what stays, what gets archived and what goes. Decisions are staged, reviewed and reversible.

| Item | Kind | Priority | Size | Depends on |
| --- | --- | --- | --- | --- |
| [TDY-01](tidy-mode.md#tdy-01-decision-tidy-mode-interaction-spec) Decision: Tidy mode interaction spec | Decision | P1 | M | none |
| [TDY-02](tidy-mode.md#tdy-02-archived-state-and-archive-view) Archived state and Archive view | Build | P2 | M | [TDY-01](tidy-mode.md#tdy-01-decision-tidy-mode-interaction-spec), [ORG-01](organize.md#org-01-decision-how-entries-change) |
| [TDY-03](tidy-mode.md#tdy-03-access-recency-signal) Access recency signal | Build | P2 | S | none |
| [TDY-04](tidy-mode.md#tdy-04-tidy-deck-candidates-api) Tidy deck candidates API | Build | P2 | M | [TDY-01](tidy-mode.md#tdy-01-decision-tidy-mode-interaction-spec), [TDY-03](tidy-mode.md#tdy-03-access-recency-signal) |
| [TDY-05](tidy-mode.md#tdy-05-tidy-decision-batches) Tidy decision batches | Build | P2 | M | [TDY-02](tidy-mode.md#tdy-02-archived-state-and-archive-view), [ORG-03](organize.md#org-03-move), [ORG-04](organize.md#org-04-trash-and-restore) |
| [TDY-06](tidy-mode.md#tdy-06-swipe-deck-ui) Swipe deck UI | Build | P2 | L | [TDY-04](tidy-mode.md#tdy-04-tidy-deck-candidates-api), [TDY-05](tidy-mode.md#tdy-05-tidy-decision-batches) |
| [TDY-07](tidy-mode.md#tdy-07-sort-into-folders-mode) Sort-into-folders mode | Build | P3 | M | [TDY-06](tidy-mode.md#tdy-06-swipe-deck-ui), [ORG-03](organize.md#org-03-move) |
| [TDY-08](tidy-mode.md#tdy-08-duplicate-resolution-card) Duplicate resolution card | Build | P3 | S | [TDY-06](tidy-mode.md#tdy-06-swipe-deck-ui), [ORG-10](organize.md#org-10-duplicate-finder) |
| [TDY-09](tidy-mode.md#tdy-09-tidy-recap) Tidy recap | Build | P3 | S | [ORG-11](organize.md#org-11-activity-and-audit-log), [TDY-05](tidy-mode.md#tdy-05-tidy-decision-batches) |

### [Storage tiers & placement](storage-tiers.md)

Files stay where they are in the library while their bytes move between hot, cool and cold storage. Each move is verified before it takes effect and the old copy is retired afterwards.

| Item | Kind | Priority | Size | Depends on |
| --- | --- | --- | --- | --- |
| [TIER-00](storage-tiers.md#tier-00-real-r2-compatibility-proof-m2) Real R2 compatibility proof (M2) (blocked on you, in flight) | Proof | P1 | L | none |
| [TIER-01](storage-tiers.md#tier-01-decision-connections-tiers-and-placement) Decision: connections, tiers and placement | Decision | P1 | M | [TIER-00](storage-tiers.md#tier-00-real-r2-compatibility-proof-m2) |
| [TIER-02](storage-tiers.md#tier-02-spike-r2-infrequent-access-behaviour) Spike: R2 Infrequent Access behaviour (blocked on you) | Spike | P2 | S | none |
| [TIER-03](storage-tiers.md#tier-03-storage-connection-registry) Storage connection registry | Build | P2 | M | [TIER-01](storage-tiers.md#tier-01-decision-connections-tiers-and-placement) |
| [TIER-04](storage-tiers.md#tier-04-multiple-verified-copies-per-version) Multiple verified copies per version | Build | P2 | L | [TIER-03](storage-tiers.md#tier-03-storage-connection-registry) |
| [TIER-05](storage-tiers.md#tier-05-move-bytes-between-tiers) Move bytes between tiers | Build | P2 | XL | [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer), [TIER-04](storage-tiers.md#tier-04-multiple-verified-copies-per-version) |
| [TIER-06](storage-tiers.md#tier-06-folder-placement-policies) Folder placement policies | Build | P3 | M | [TIER-05](storage-tiers.md#tier-05-move-bytes-between-tiers), [COST-03](cost-and-insight.md#cost-03-decision-cost-estimate-model) |
| [TIER-07](storage-tiers.md#tier-07-design-archive-retrieval-model) Design: archive retrieval model | Decision | P3 | S | [TIER-01](storage-tiers.md#tier-01-decision-connections-tiers-and-placement) |
| [TIER-08](storage-tiers.md#tier-08-decision-second-provider-for-cold-or-offsite-storage) Decision: second provider for cold or offsite storage | Decision | P3 | S | [TIER-00](storage-tiers.md#tier-00-real-r2-compatibility-proof-m2) |
| [TIER-09](storage-tiers.md#tier-09-local-hot-cache-for-cloud-files) Local hot cache for cloud files | Build | P3 | M | [TIER-04](storage-tiers.md#tier-04-multiple-verified-copies-per-version) |

### [Cost & insight](cost-and-insight.md)

Show where the bytes are and roughly what they cost, with dated sources. These are estimates, not invoices.

| Item | Kind | Priority | Size | Depends on |
| --- | --- | --- | --- | --- |
| [COST-01](cost-and-insight.md#cost-01-usage-rollups) Usage rollups | Build | P2 | M | none |
| [COST-02](cost-and-insight.md#cost-02-space-map) Space map | Build | P2 | M | [COST-01](cost-and-insight.md#cost-01-usage-rollups) |
| [COST-03](cost-and-insight.md#cost-03-decision-cost-estimate-model) Decision: cost estimate model | Decision | P2 | S | none |
| [COST-04](cost-and-insight.md#cost-04-monthly-estimate-on-the-storage-page) Monthly estimate on the Storage page | Build | P2 | M | [COST-01](cost-and-insight.md#cost-01-usage-rollups), [COST-03](cost-and-insight.md#cost-03-decision-cost-estimate-model), [M1-09](finish-m1.md#m1-09-read-only-storage-page) |
| [COST-05](cost-and-insight.md#cost-05-what-if-preview) What-if preview | Build | P3 | S | [COST-04](cost-and-insight.md#cost-04-monthly-estimate-on-the-storage-page), [TIER-01](storage-tiers.md#tier-01-decision-connections-tiers-and-placement) |
| [COST-06](cost-and-insight.md#cost-06-advisory-archival-rules-m5) Advisory archival rules (M5) | Build | P3 | M | [TDY-04](tidy-mode.md#tdy-04-tidy-deck-candidates-api), [TDY-03](tidy-mode.md#tdy-03-access-recency-signal) |
| [COST-07](cost-and-insight.md#cost-07-growth-trend) Growth trend | Build | P3 | S | [COST-01](cost-and-insight.md#cost-01-usage-rollups) |

### [Integrity & recovery](integrity-and-recovery.md)

A library you can prove is intact and can rebuild from an export. This is M4.

| Item | Kind | Priority | Size | Depends on |
| --- | --- | --- | --- | --- |
| [REC-01](integrity-and-recovery.md#rec-01-integrity-scrubber) Integrity scrubber | Build | P2 | L | [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer) |
| [REC-02](integrity-and-recovery.md#rec-02-consistency-report) Consistency report | Build | P2 | S | none |
| [REC-03](integrity-and-recovery.md#rec-03-decision-export-format) Decision: export format | Decision | P2 | S | none |
| [REC-04](integrity-and-recovery.md#rec-04-export-command) Export command | Build | P3 | M | [REC-03](integrity-and-recovery.md#rec-03-decision-export-format) |
| [REC-05](integrity-and-recovery.md#rec-05-restore-into-a-clean-installation) Restore into a clean installation | Proof | P3 | M | [REC-04](integrity-and-recovery.md#rec-04-export-command), [M1-07](finish-m1.md#m1-07-container-image-and-compose-from-a-clean-checkout) |
| [REC-06](integrity-and-recovery.md#rec-06-backup-and-restore-drill) Backup and restore drill | Proof | P3 | M | [M1-07](finish-m1.md#m1-07-container-image-and-compose-from-a-clean-checkout) |
| [REC-07](integrity-and-recovery.md#rec-07-upgrade-drill) Upgrade drill | Proof | P3 | M | [M1-07](finish-m1.md#m1-07-container-image-and-compose-from-a-clean-checkout), [ENG-11](foundations.md#eng-11-migration-upgrade-test-harness) |

### [Configurable shell](configurable-shell.md)

Same app, your layout: modules, regions, presets and per-folder views, without affecting permissions or losing the way back.

| Item | Kind | Priority | Size | Depends on |
| --- | --- | --- | --- | --- |
| [CFG-01](configurable-shell.md#cfg-01-decision-configurable-shell-model) Decision: configurable shell model | Decision | P2 | M | none |
| [CFG-02](configurable-shell.md#cfg-02-module-registry-and-layout-engine) Module registry and layout engine | Build | P2 | L | [CFG-01](configurable-shell.md#cfg-01-decision-configurable-shell-model), [LIB-01](everyday-library.md#lib-01-design-tokens-and-shell-foundation) |
| [CFG-03](configurable-shell.md#cfg-03-customize-layout-panel) Customize Layout panel | Build | P3 | M | [CFG-02](configurable-shell.md#cfg-02-module-registry-and-layout-engine) |
| [CFG-04](configurable-shell.md#cfg-04-preferences-api) Preferences API | Build | P3 | M | [CFG-01](configurable-shell.md#cfg-01-decision-configurable-shell-model) |
| [CFG-05](configurable-shell.md#cfg-05-per-folder-view-settings) Per-folder view settings | Build | P3 | M | [CFG-04](configurable-shell.md#cfg-04-preferences-api), [LIB-03](everyday-library.md#lib-03-server-side-sort-for-folder-listings), [LIB-04](everyday-library.md#lib-04-table-and-grid-views) |
| [CFG-06](configurable-shell.md#cfg-06-layout-import-and-export) Layout import and export | Build | P3 | S | [CFG-02](configurable-shell.md#cfg-02-module-registry-and-layout-engine) |
| [CFG-07](configurable-shell.md#cfg-07-saved-views-smart-folders) Saved views (smart folders) | Build | P3 | M | [LIB-07](everyday-library.md#lib-07-name-search), [ORG-08](organize.md#org-08-tags) |
| [CFG-08](configurable-shell.md#cfg-08-operator-configuration-reference) Operator configuration reference | Build | P3 | S | none |

### [Access & sharing](access-and-sharing.md)

Keep the owner's account secure, and let them share read-only links they can revoke.

| Item | Kind | Priority | Size | Depends on |
| --- | --- | --- | --- | --- |
| [ACC-01](access-and-sharing.md#acc-01-session-management) Session management | Build | P2 | M | none |
| [ACC-02](access-and-sharing.md#acc-02-passkeys-for-owner-sign-in) Passkeys for owner sign-in (in flight) | Build | P3 | L | none |
| [ACC-03](access-and-sharing.md#acc-03-decision-read-only-sharing) Decision: read-only sharing | Decision | P2 | M | none |
| [ACC-04](access-and-sharing.md#acc-04-file-share-links) File share links | Build | P3 | L | [ACC-03](access-and-sharing.md#acc-03-decision-read-only-sharing), [ORG-11](organize.md#org-11-activity-and-audit-log), [M1-08](finish-m1.md#m1-08-serve-the-web-app-from-the-backend-at-one-origin) |
| [ACC-05](access-and-sharing.md#acc-05-folder-share-links) Folder share links | Build | P3 | M | [ACC-04](access-and-sharing.md#acc-04-file-share-links), [ORG-09](organize.md#org-09-download-a-folder-as-zip) |
| [ACC-06](access-and-sharing.md#acc-06-decision-second-user-and-roles) Decision: second user and roles (in flight) | Decision | P3 | M | [M1-06](finish-m1.md#m1-06-prove-second-principal-isolation-over-http) |

### [Bring files in](bring-files-in.md)

Ways to adopt Filebonsai: import an existing folder tree, upload whole folders, install it as an app.

| Item | Kind | Priority | Size | Depends on |
| --- | --- | --- | --- | --- |
| [IMP-01](bring-files-in.md#imp-01-import-an-existing-folder-from-the-server) Import an existing folder from the server | Build | P2 | L | [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer) |
| [IMP-02](bring-files-in.md#imp-02-folder-upload-from-the-browser) Folder upload from the browser | Build | P2 | M | [M1-11](finish-m1.md#m1-11-drag-and-drop-upload) |
| [IMP-03](bring-files-in.md#imp-03-installable-web-app) Installable web app | Build | P3 | S | [LIB-01](everyday-library.md#lib-01-design-tokens-and-shell-foundation) |
| [IMP-04](bring-files-in.md#imp-04-spike-read-only-webdav) Spike: read-only WebDAV | Spike | P3 | S | none |
| [IMP-05](bring-files-in.md#imp-05-watched-drop-folder) Watched drop folder | Build | P3 | M | [IMP-01](bring-files-in.md#imp-01-import-an-existing-folder-from-the-server) |

### [iOS](ios.md)

On hold by your choice. When it resumes: native browsing, background transfers, the share sheet, and Tidy with haptics.

| Item | Kind | Priority | Size | Depends on |
| --- | --- | --- | --- | --- |
| [IOS-01](ios.md#ios-01-decision-native-auth-and-background-transfers) Decision: native auth and background transfers (in flight) | Decision | P2 | M | none |
| [IOS-02](ios.md#ios-02-ios-catalog-slice) iOS Catalog slice (blocked on you) | Build | P3 | L | [IOS-01](ios.md#ios-01-decision-native-auth-and-background-transfers) |
| [IOS-03](ios.md#ios-03-background-uploads) Background uploads (blocked on you) | Build | P3 | L | [IOS-02](ios.md#ios-02-ios-catalog-slice) |
| [IOS-04](ios.md#ios-04-share-extension) Share extension (blocked on you) | Build | P3 | M | [IOS-03](ios.md#ios-03-background-uploads) |
| [IOS-05](ios.md#ios-05-photos-import-with-duplicate-skip) Photos import with duplicate skip (blocked on you) | Build | P3 | M | [IOS-03](ios.md#ios-03-background-uploads), [ORG-10](organize.md#org-10-duplicate-finder) |
| [IOS-06](ios.md#ios-06-native-tidy-with-haptics) Native Tidy with haptics (blocked on you) | Build | P3 | M | [IOS-02](ios.md#ios-02-ios-catalog-slice), [TDY-05](tidy-mode.md#tdy-05-tidy-decision-batches) |
| [IOS-07](ios.md#ios-07-spike-files-app-integration) Spike: Files app integration (blocked on you) | Spike | P3 | M | none |
