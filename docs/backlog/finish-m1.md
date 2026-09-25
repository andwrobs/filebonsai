# Finish M1

M1 promises that a clean checkout becomes a working, recoverable library. Close the gaps before stacking features on it.

Most of the seven M1 scenarios are proven in backend tests. A few are proven only with synthetic browser fixtures. Two have real gaps: nothing runs from a clean checkout without a host JDK and PostgreSQL, and the breadcrumb is a fixed 'Library / folder' label rather than a path. Everything else builds on this.

See [the backlog index](README.md) for how to pick up and retire items.

## M1-01 Map M1 failure outcomes in the web client

`P1` · `M` · Build · Web

Depends on: none

**Why.** The web client turns most server errors into 'Request failed (413)'. Since PR #8 a signed-out page load goes to `/sign-in`, but it doesn't return to the original folder afterwards, and an expired session during an action isn't handled.

**Outcome.** Every M1 scenario 7 outcome gets a specific message and a recovery action. An expired session returns to the same folder after sign-in.

**Acceptance**

- TOO_LARGE, STORAGE_UNAVAILABLE, RATE_LIMITED, NAME_CONFLICT, IDEMPOTENCY_CONFLICT and VALIDATION_FAILED each map to a message and an action, with unit tests
- AUTH_REQUIRED while browsing or creating a folder redirects to sign-in and back to the original folder
- The tab's transfer store keeps tracking uploads across re-authentication
- Rendered states for too-large, duplicate name and expired session

**Invariants:** INV-14  
**Read:** `docs/product/overview.md`, `docs/product/invariants.md`  
**Checks:** `web`; `rendered`

## M1-02 Breadcrumbs from real ancestors

`P1` · `M` · Build · Backend, Web · Public API change

Depends on: none

**Why.** The header shows 'Library / {folder}'. M1 scenario 2 says you return through breadcrumbs, and nested folders currently lose their path.

**Outcome.** Folder responses carry the ordered ancestor chain (id, name) from the root, and the web client renders a clickable breadcrumb that collapses on narrow screens.

**Acceptance**

- Ancestors come from one bounded recursive query, tested at depth 1, 2 and 50
- Workspace-scoped; an inaccessible entry stays indistinguishable from a missing one
- At 390px the middle segments collapse into a '…' menu; every segment is keyboard reachable
- Long names truncate visually and expose the full name to assistive tech

**Settle first**

- Embed `ancestors` on getEntry only, or add GET /entries/{id}/ancestors. Recommendation: embed on getEntry, not on list items.

**Invariants:** INV-01  
**Read:** `docs/product/catalog.md`, `docs/api/conventions.md`  
**Checks:** `contract`; `postgres`; `web`; `rendered`

## M1-03 Rediscover and cancel open uploads

`P1` · `L` · Build · Backend, Web · Public API change

Depends on: none

**Why.** After a reload, the browser can't find its open upload sessions. They keep holding their names until expiry, and nothing can cancel them.

**Outcome.** A workspace-scoped list of non-terminal upload sessions, plus a web view that shows them after reload, polls FINALIZING and RECONCILING, and offers cancel. Retry requires reselecting the same file.

**Acceptance**

- PostgreSQL tests for scoping, cross-workspace invisibility and ordering
- No object keys, provider upload IDs or paths in the DTO
- Browser check: reload mid-upload, then cancel, and the name is freed

**Invariants:** INV-01, INV-08, INV-11, INV-14  
**Read:** `docs/architecture/storage-and-transfers.md`, `docs/api/conventions.md`  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## M1-05 Prove interruption and restart recovery in the browser

`P1` · `M` · Proof · Web, Backend

Depends on: none

**Why.** Retry and reconciliation have been shown in the browser only against synthetic responses.

**Outcome.** Observed evidence against the real backend: kill it mid-body, kill it after complete is sent, and cancel during a PUT. After restart, retry and status checks converge, and the downloaded SHA-256 matches the source.

**Acceptance**

- No duplicate entries after retry
- Uncertain completion reconciles to AVAILABLE or a truthful failure
- Cancellation frees the name and publishes no bytes
- Screenshots and digests recorded in status.md

**Invariants:** INV-04, INV-09, INV-10, INV-14  
**Read:** `docs/architecture/storage-and-transfers.md`, `docs/development/testing.md`  
**Checks:** `web`; `rendered`

## M1-06 Prove second-principal isolation over HTTP

`P1` · `M` · Proof · Backend

Depends on: none

**Why.** M1 scenario 6 is proven below the HTTP layer, but never with two real signed-in sessions.

**Outcome.** A PostgreSQL HTTP suite in which a second principal, in its own workspace, gets not-found for every endpoint touching the owner's resources, and the owner's data is unchanged.

**Acceptance**

- Covers getEntry, listChildren, downloadOriginal, createFolder, getUpload, putUploadContent, completeUpload and cancelUpload
- Test-only principal setup; no invitation feature
- No IDs or paths leak in responses or logs

**Invariants:** INV-01, INV-11  
**Read:** `docs/development/testing.md`  
**Checks:** `postgres`

## M1-07 Container image and Compose from a clean checkout

`P1` · `L` · Build · Ops

Depends on: [M1-08](#m1-08-serve-the-web-app-from-the-backend-at-one-origin)

Context: PR #1 (merged 2026-09-23) added backend and web Dockerfiles and `infra/local/compose.yml`, a development stack with Authentik OIDC in which the web app runs the Vite dev server in its own container. Decide whether to extend that stack or add a separate production Compose file. It may conflict with single-origin serving (M1-08).

**Why.** system.md describes a container plus PostgreSQL through Compose. Today you need a host JDK, a local PostgreSQL and hand-copied config, so M1 scenario 1 is unproven.

**Outcome.** A multi-stage Dockerfile (Maven and web build, then a JRE runtime) running as a non-root user with an explicit /data volume, and a compose.yaml with PostgreSQL 17, healthchecks and named volumes. The bootstrap password comes from a Docker secret file.

**Acceptance**

- Fresh clone: `docker compose up` → bootstrap → sign in → folder → upload → download with a matching SHA-256
- Restart keeps the session and data
- Runs as non-root with a read-only root filesystem apart from /data and /tmp
- No secrets in image layers or logs; a second bootstrap start fails without replacing the owner

**Settle first**

- Image publishing: local build only until there's a release decision

**Invariants:** INV-11  
**Read:** `docs/architecture/system.md`, `docs/development/local-setup.md`  
**Checks:** docker compose build and up on a clean clone, then a scripted smoke test (sign in, upload, download, digest compare) and a restart check

## M1-08 Serve the web app from the backend at one origin

`P1` · `M` · Build · Backend, Web

Depends on: none

Context: PR #1 (merged 2026-09-23) runs the web app from its own Dockerfile on the Vite dev server in the local Compose stack. Decide whether that stack switches to backend-served assets once this lands.

**Why.** system.md says the server serves the API and the built web assets at one origin. Today the web app runs on the Vite dev server behind a proxy.

**Outcome.** The backend serves the production web build with SPA fallback, immutable caching for hashed assets, no-store for index.html, and security headers.

**Acceptance**

- Deep links such as /library/{id} and /sign-in survive a reload
- Unknown /api paths still return JSON 404s
- CSP without unsafe-inline scripts, frame-ancestors 'none', Referrer-Policy, Permissions-Policy and nosniff, all asserted in HTTP tests
- No CSP violations in the running app

**Checks:** `backend`; Production web build served by the backend and inspected in a browser

## M1-09 Read-only Storage page

`P1` · `M` · Build · Backend, Web · Public API change

Depends on: none

Context: M1-04 added `GET /api/v1/upload-limits` (`UploadLimitsResponse`, the effective limit begin-upload enforces). Show that value rather than deriving another one.

**Why.** design.md requires an M1 Storage surface that shows the configured connection, capabilities and limits, with no credential editor. The sidebar currently has a disabled placeholder.

**Outcome.** An authenticated read-only summary of the active connection (display name, provider kind), capabilities, limits and bytes used, plus a web Storage page.

**Acceptance**

- A serialization test proves the DTO has no credentials, bucket keys, account IDs, endpoints or paths
- Bytes used count committed versions only
- Loading, error and unavailable states rendered

**Settle first**

- Is the bucket name sensitive? Default: show the operator's display name only

**Invariants:** INV-11  
**Read:** `docs/product/design.md`  
**Checks:** `contract`; `web`; `rendered`

## M1-10 Honest determinate upload progress

`P2` · `S` · Build · Web

Depends on: none

**Why.** Upload progress is indeterminate because fetch has no upload progress events.

**Outcome.** The body PUT uses XHR upload progress. The UI shows bytes sent of total, then a separate 'Verifying and finalizing' phase, so reaching 100% sent never reads as saved.

**Acceptance**

- Cancel aborts the XHR and follows existing cancellation fencing
- CSRF header and cookies preserved
- Screen-reader announcements throttled to quartiles
- transfer-store tests cover progress, abort and a lost response

**Invariants:** INV-14  
**Checks:** `web`; `rendered`

## M1-11 Drag-and-drop upload

`P2` · `S` · Build · Web

Depends on: none

**Why.** The design direction assumes you can drop files onto the library.

**Outcome.** Drop files onto the folder view, or onto a folder row to upload into that folder. The button path stays.

**Acceptance**

- The drop target is indicated by more than color
- Dropping a directory explains that folder upload comes later (IMP-02)
- Keyboard and touch users keep the upload button

**Checks:** `web`; `rendered`

## M1-12 M1 exit review

`P1` · `M` · Proof · Ops, Web, Backend

Depends on: [M1-01](#m1-01-map-m1-failure-outcomes-in-the-web-client), [M1-02](#m1-02-breadcrumbs-from-real-ancestors), [M1-03](#m1-03-rediscover-and-cancel-open-uploads), [M1-05](#m1-05-prove-interruption-and-restart-recovery-in-the-browser), [M1-06](#m1-06-prove-second-principal-isolation-over-http), [M1-07](#m1-07-container-image-and-compose-from-a-clean-checkout), [M1-09](#m1-09-read-only-storage-page)

**Why.** Declare M1 done with evidence, or name what's left.

**Outcome.** Walk all seven M1 scenarios end to end on the Compose deployment with disposable data. Record per-scenario evidence in status.md and update the milestone table in overview.md.

**Acceptance**

- Each scenario has recorded commands, screenshots or digests
- Every M1 surface that design.md requires is present in the running app, or M1 is not declared done
- Remaining gaps become backlog items
- No claims beyond the evidence

**Read:** `docs/product/overview.md`, `docs/product/design.md`  
**Checks:** Scripted or recorded run of each scenario
