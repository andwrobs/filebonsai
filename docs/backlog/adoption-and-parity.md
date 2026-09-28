# Everyday parity and open-source adoption

The target is a credible everyday alternative with distinctive photo curation and storage control. Parity means completing real user journeys, including failure and recovery; it does not require cloning an office suite. Candidate priorities below do not override status.md's ordered work.

## Capability coverage

| User job | Existing owner | Gap or extension |
| --- | --- | --- |
| Browse, sort, select, rename, move, trash, restore | LIB, ORG, M1 | Complete existing work before parallel replacements |
| Find by name, metadata or document contents | LIB-07, MET-05/06 | Facets, local OCR and index freshness |
| Recover prior content | ORG-06/07 | POL-05 retention/pins; REC restore drills |
| Send a revocable file/folder link | ACC-03/04/05 | PHO-09 albums; PAR-02 recipient/owner management |
| Collect files from other people | No current implementation | PAR-03 upload-only requests |
| Work with another person | ACC-06 role decision | PAR-01 membership implementation; granular ACLs remain a separate later decision |
| Use files offline or in desktop tools | IMP-03 PWA; IOS-07 Files spike | PAR-04/05; distinguish download, offline pin and bidirectional sync |
| Bring an existing library | IMP-01/02/05 | PHO-07 media migration; PAR-06 user-facing import report |
| Organize photos, places and albums | PRV, RFL, PHO, TDY | First-class photo home and persistent album targets |
| Own storage, lifecycle and recovery | TIER, POL, REC | App settings, proven providers and portable curation |
| Install, contribute and trust releases | M1-07, REC-06/07, ENG-01 | OSS-01/02/03 below |

Sources checked 2026-09-28: [Google Drive search](https://support.google.com/drive/answer/2375114?hl=en-GB) combines filters with names/content; [Dropbox version history](https://help.dropbox.com/delete-restore/version-history-overview) exposes prior changes and restoration; [Dropbox file requests](https://help.dropbox.com/share/create-file-request) collect uploads without granting library access; [Google Photos albums](https://support.google.com/photos/answer/6128849?hl=en-0) provide multi-item collection and cover editing. These establish useful workflow benchmarks, not an exhaustive feature or plan comparison.

Collaborative document editing, hosted multi-tenancy and client-only encryption are not silently added by “parity.” A maintained desktop sync client is a substantial separate commitment. Native iOS remains deferred; responsive web can deliver mobile album curation and Tidy first.

See [the backlog index](README.md) for pickup, checks and retirement rules.

## PAR-01 Workspace invitations and role enforcement

`P3` · `L` · Build · Backend, Web · Public API change

Depends on: [ACC-06](access-and-sharing.md#acc-06-decision-second-user-and-roles), [ACC-01](access-and-sharing.md#acc-01-session-management)

**Why.** A family or small team needs more than one owner login.

**Outcome.** Implement the accepted viewer/editor/owner model, explicit invitations, membership removal and owner transfer. Reuse the existing session/workspace authorization boundary; split invite lifecycle from permission UI at pickup.

**Acceptance**

- Role tests cover browse, originals, metadata, albums, mutation, sharing, policies and storage administration for implemented features.
- Revocation invalidates access for in-flight/background operations according to the accepted decision.
- Expired/replayed invitations fail safely; the last owner cannot accidentally leave the workspace ownerless.

**Settle first.** Invitation delivery without requiring an email service; OIDC identity mapping and owner-transfer reauthentication from ACC-06.

**Invariants:** INV-01, INV-05, INV-09, INV-11

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; `web`; `rendered`

## PAR-02 Shared-link management and recipient experience

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: [ACC-04](access-and-sharing.md#acc-04-file-share-links)

**Why.** Users need to see what is exposed and recipients need a clear download experience.

**Outcome.** Add an owner sharing dashboard with target, access mode, expiry and revoke actions, plus recipient password/expired/unavailable states and large-download feedback. Reuse ACC grants; extend to folders/albums as they ship.

**Acceptance**

- Bulk revocation reports per-link outcomes; display names never include tokens and access counts reveal no unnecessary visitor data.
- Recipient navigation cannot escape its grant; an owner can test a link without granting more access.
- Accessibility, filename wrapping and mobile download failure states are rendered.

**Settle first.** Password support and privacy-safe access accounting per ACC-03; no claim that revocation erases files already downloaded.

**Invariants:** INV-01, INV-11, INV-12, INV-14

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; `web`; `rendered`

## PAR-03 Decision: upload-only file requests

`P2` · `M` · Decision · Backend, Web, Docs

Depends on: [ACC-03](access-and-sharing.md#acc-03-decision-read-only-sharing)

**Why.** Collecting event photos or documents should not require sharing the destination folder.

**Outcome.** Define scoped expiring upload-only grants, recipient quotas, owner review/quarantine and a minimal guest flow. Separate collection from read-only sharing and authenticated workspace membership.

**Acceptance**

- Uploader cannot list, download, overwrite or infer another submission; destination is server-selected.
- Specify total/request/file budgets, abuse throttling, close/revoke races, retries and cleanup of abandoned uploads.
- Define content scanning/quarantine policy and who pays storage costs; no executable preview of unreviewed content.

**Settle first.** Anonymous versus invited submitters, optional passwords and acceptance review; build tasks follow acceptance of this decision.

**Invariants:** INV-01, INV-02, INV-05, INV-09, INV-11, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `decision-review`

## PAR-04 Decision: offline access and desktop synchronization

`P3` · `M` · Decision · Clients, Backend, Docs

Depends on: [ORG-06](organize.md#org-06-upload-a-new-version-of-a-file)

**Why.** Offline downloads and reliable two-way sync have very different complexity.

**Outcome.** Compare explicit offline pins, read-only mounted access, and selective two-way desktop sync. Define a recommended first platform and scope with durable change feed, conflict copies, tombstones, case collisions and device authorization.

**Acceptance**

- Walk through offline rename versus server move, delete versus edit, two-device replacement and case-sensitive names on a case-insensitive filesystem.
- Specify local cache protection/cleanup, device revocation, change-feed retention and recovery after a cursor expires.
- Estimate maintenance and packaging burden; keep M1 whole-body retry unchanged unless a separate resumable-upload decision is accepted.

**Settle first.** First supported OS/client and whether demand justifies a native desktop daemon; Android remains uncommitted.

**Invariants:** INV-01, INV-03, INV-08, INV-10, INV-13

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `decision-review`

## PAR-05 Explicit offline file pins

`P3` · `L` · Build · Clients, Backend · Public API change

Depends on: [PAR-04](#par-04-decision-offline-access-and-desktop-synchronization)

**Why.** Users need to know exactly which files will still work without a network.

**Outcome.** Implement the accepted first-platform offline-pin slice with bounded quota, version-aware download verification and visible local/server freshness. Do not imply two-way editing until that separate slice exists.

**Acceptance**

- Pin completion means verified bytes are locally available; interrupted caching resumes or honestly restarts.
- Offline missing/stale files are distinguished; eviction never removes the only authoritative copy.
- Account changes and sign-out follow the accepted local-data policy; revoked access cannot make an impossible promise to erase copied files.

**Settle first.** Platform and accepted cache model from PAR-04; native implementation also needs its platform deferral lifted.

**Invariants:** INV-01, INV-06, INV-10, INV-14, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** platform tests; offline/reconnect/relaunch rendered drill

## PAR-06 Import center and durable operation feedback

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: [IMP-01](bring-files-in.md#imp-01-import-an-existing-folder-from-the-server), [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer)

**Why.** Large imports need a discoverable result even after the user leaves the page.

**Outcome.** Show durable import progress, pause/cancel where supported, rejected-file reasons and a downloadable safe report. Establish an operation-summary pattern reusable by exports and restores without replacing the upload tray.

**Acceptance**

- Reload/navigation recovers server-owned progress; failed items can be retried without reimporting successes.
- Reports reconcile all selected inputs and distinguish duplicates, unsupported names and storage failures.
- Sensitive host paths and source credentials never appear in ordinary responses; display source-relative labels only.

**Settle first.** Report retention and whether cancellation is immediate or stops at the next file boundary.

**Invariants:** INV-02, INV-10, INV-11, INV-14

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; `web`; `rendered`

## PAR-07 Decision: resumable large-file transfers

`P3` · `M` · Decision · Backend, Clients, Docs

Depends on: [M1-05](finish-m1.md#m1-05-prove-interruption-and-restart-recovery-in-the-browser), [ENG-10](foundations.md#eng-10-measured-resource-baselines-for-transfers), [TIER-00](storage-tiers.md#tier-00-real-r2-compatibility-proof-m2)

**Why.** Resending a large body from zero becomes costly on unreliable mobile connections.

**Outcome.** Evaluate a resumable client-to-server protocol after M1 and the real provider are proven. Distinguish client upload chunks from provider multipart parts, and define durable offsets, digests, cancellation and expiry.

**Acceptance**

- Compare a standard protocol against a small native extension with recovery and storage budgets.
- Specify compatibility with existing uploads and generated clients, including offset disagreement and replayed chunks.
- A later build must demonstrate restart, corruption rejection and bounded staging; this decision makes no current resume claim.

**Settle first.** Measured file sizes/network pain, protocol choice and whether resumability merits added state.

**Invariants:** INV-04, INV-05, INV-06, INV-09, INV-10, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `decision-review`

## OSS-01 Decision: license and contributor contract

`P1` · `S` · Decision · Docs

Depends on: none

**Why.** The open-source goal needs an explicit license and contribution expectations.

**Outcome.** Prepare a maintainer-reviewed license choice, dependency/asset compatibility inventory, contribution rules and security-reporting path. Explain permissive versus copyleft tradeoffs with current primary license texts; do not select a license silently.

**Acceptance**

- Name the copyright holder decision and all shipped code/font/icon/decoder license obligations.
- Propose contribution and vulnerability-reporting documents proportionate to a small project.
- No release or publication occurs as part of the decision.

**Settle first.** Maintainer license preference and whether a DCO is appropriate; legal conclusions need qualified review if required.

**Invariants:** INV-11

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `decision-review`; dated primary license references

## OSS-02 First-run setup and operator readiness

`P2` · `M` · Build · Web, Ops, Docs

Depends on: [M1-07](finish-m1.md#m1-07-container-image-and-compose-from-a-clean-checkout), [CFG-09](configurable-shell.md#cfg-09-runtime-ui-capabilities-api)

**Why.** A new self-hoster should reach a working library without hidden setup knowledge.

**Outcome.** Provide safe first-run guidance, local-owner bootstrap instructions, connection/processing readiness and an empty-library import/upload path. Use operator commands for deployment secrets and TIER-13 for app-managed storage once implemented.

**Acceptance**

- A clean-install walkthrough records time and every manual step; setup survives restart without recreating identity/root.
- Missing storage, processor or proxy configuration gives actionable safe messages; no credentials displayed in UI/logs.
- A synthetic demo library is optional and clearly labeled, never injected into a real workspace by default.

**Settle first.** Supported first deployment target; documentation and UI ownership without inventing a hosted onboarding service.

**Invariants:** INV-01, INV-10, INV-11, INV-14

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** clean-install drill; `web`; `rendered`

## OSS-03 Release readiness and recovery acceptance

`P2` · `M` · Proof · Ops, Docs

Depends on: [OSS-01](#oss-01-decision-license-and-contributor-contract), [REC-05](integrity-and-recovery.md#rec-05-restore-into-a-clean-installation), [REC-06](integrity-and-recovery.md#rec-06-backup-and-restore-drill), [REC-07](integrity-and-recovery.md#rec-07-upgrade-drill), [ENG-01](foundations.md#eng-01-web-ci-and-contract-drift-checks)

**Why.** A trustworthy open-source alternative must be installable, upgradeable and recoverable by someone else.

**Outcome.** Draft a supported-version/platform matrix and release checklist with reproducible artifacts, dependency notices, security-update procedure and observed restore evidence. This prepares a release; publishing requires separate authorization.

**Acceptance**

- An independent clean installation, upgrade and restore preserve file digests, hierarchy and implemented metadata/album/policy state.
- Document measured scale/resource limits and unproven providers/formats; feature claims link to observed evidence.
- Include a small usability script for browse/find/share/curate/recover and a way to report failures without uploading private files.

**Settle first.** First supported architecture, retention of releases and maintainer support scope.

**Invariants:** INV-11, INV-13, INV-16

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** documented install/upgrade/restore drill; maintainer review
