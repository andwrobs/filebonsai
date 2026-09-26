# Verified status and next work

Updated 2026-09-26. This is the only live status and sequencing document. Record only
observed results; use Git history for prior plans and completed migrations.

## Current implementation

- The repository root is the Git root. `backend/` is an executable Java 21 modular
  monolith. `web/` is a React Router single-page Catalog client; `ios/` remains a
  planned application root.
- Catalog is organized as `domain`, `application`, `web`, `persistence`, and `support`,
  with cross-capability HTTP code under `platform/web`.
- Java controllers/DTOs author the OpenAPI contract. Pinned TypeScript and Swift
  generation is reproducible; generated output remains disposable.
- Flyway V1–V6 define workspace membership, names/reservations, entries, immutable
  versions/objects, idempotency, local-owner sessions, credential-reset replay, login
  throttling, checks, and PostgreSQL guarantees.
- Flyway V7 and the local-transfer adapter provide durable upload intent, streamed
  size/digest verification, whole-body retry, cancellation, restart reconciliation,
  and immutable original download. Finalization pins its name reservation until
  publication or recovery resolves it; safely expired sessions release the name.
- Flyway V8 and the optional R2 publisher add durable provider attempts, 8 MiB
  multipart parts, server-held credentials intended for one bucket, full-object
  SHA-256 readback,
  unique keys for uncertain retries, and periodic recovery. The local provider is
  still the default. R2 behavior has passed PostgreSQL tests with an injected gateway;
  it has not been exercised against a real R2 bucket.
- An opt-in real-bucket proof runner now prepares deterministic synthetic bodies,
  PostgreSQL-backed transfer scenarios, injected uncertain responses around real
  provider calls, bounded resource observations, and prefix-scoped cleanup. Its local
  fixture, fault-ordering, and gate checks pass; no live R2 result has been observed.
- The jOOQ PostgreSQL adapter remains behind operation ports. Its 13 Testcontainers
  tests cover workspace scope, deterministic ordering, reservations, idempotency,
  rollback/concurrency, immutable identities/versions/objects, domain constraints,
  root protection, and generated-schema drift.
- The PostgreSQL profile exposes authenticated Catalog HTTP through session-derived
  membership scope. Local-owner access includes secret-file bootstrap/reset,
  PostgreSQL-backed sessions, rotation/logout/reset invalidation, CSRF, persisted
  login throttling, generic failures, and secure-by-default cookies.
- The local Docker Compose stack runs PostgreSQL, the backend, the web client, and
  Authentik. Authentik OIDC sign-in is pinned to its administrator UUID and issues
  the existing PostgreSQL-backed Filebonsai session. A different Authentik user is
  denied before a Filebonsai session is created.
- Local-owner bootstrap atomically creates the principal, owner credential, initial
  workspace membership, workspace, and protected `Library` root. Repeated bootstrap
  fails without replacing the packet; restart preserves authenticated catalog access.
- The committed OpenAPI is exported from the PostgreSQL profile and includes Access
  and Catalog. The fixture profile still authors deterministic response fixtures.
- `web/` owns a React Router Catalog application over a generated
  `openapi-typescript` schema and handwritten `openapi-fetch` service. It discovers
  the session workspace root, browses direct children, navigates folders, handles
  password sign-in for anonymous visitors (plus **Continue with Authentik** when
  `VITE_FILEBONSAI_OIDC=authentik`), loading/empty/error/not-found states, and exposes
  TanStack Form folder creation
  with caller-owned idempotency keys. The boundary includes cookie credentials, CSRF
  refresh/rotation handling, and pagination.
- Web Catalog now provides multi-file upload and original download controls. A tab-owned
  transfer store survives folder navigation, retains begin idempotency keys, checks
  durable state before whole-body retry, fences late replies after cancellation, and
  refreshes CSRF for explicit transfer operations. Sending progress is indeterminate;
  uncertain completion requires an explicit status check. Closing/reloading the tab
  does not preserve its selected files or upload tracking.
- Authenticated `GET /api/v1/upload-limits` exposes the effective `maximumBytes`
  (the smaller of the staging and publisher limits, the value begin-upload enforces).
  The web transfer store reads it once per tab and refuses larger files before
  `beginUpload`, naming the limit; an unreadable limit or a `413` defers to the server.
- Authenticated `GET /api/v1/storage` describes the configured connection (operator
  display name, open-vocabulary provider kind), transfer capabilities, and committed
  `usedBytes` for the member's workspace. It carries no bucket, account, endpoint,
  credential, or path. The web `/storage` page shows it with the upload limit and has its
  own loading, error, and unavailable states. The shell links Library and Storage in
  every layout.
- The web shell follows the design reference with one token file
  (`web/app/styles/tokens.css`) for color, type, spacing, radius, density, and region
  sizes. `tokens.test.ts` fails on raw colors elsewhere and on AA contrast regressions.
  Icons are Lucide (ISC); the identity is a text wordmark in system sans-serif. A
  pathless layout route keeps navigation and the transfer tray mounted across Library
  and Storage. The shell shows a full sidebar from 1100px and an icon rail from 768px.
  Below 768px it has a top bar, bottom navigation, and a floating upload button, with
  safe-area padding. The folder list is a dense table (icon, name, kind, size,
  modified, download). Its container queries drop the kind column and then stack
  rows into two lines as the list narrows. Kind is display-only and comes from the
  filename extension. Uploads sit in a bottom tray. It opens when an upload starts or
  needs attention and folds away once everything settles. On phones the floating
  upload button sits above the tray at its measured height. The sidebar's
  Storage entry shows the connection name and committed bytes. The Recent, Shared,
  and Archive placeholders are gone. Breadcrumbs still show only Library and the
  current folder (M1-02).

## Latest observed checks

- Responsive shell (LIB-01, LIB-10): `cd web && npm test && npm run typecheck:run &&
  npm run build` passed with 32 tests, strict TypeScript, and a production SPA build.
  The tests include new kind and date helpers, token contrast, and a no-raw-colors scan.
  The check ran against a disposable PostgreSQL-profile backend: a PostgreSQL 17.6
  container, a generated owner password, and a synthetic library of 70 entries. In the
  Claude desktop in-app browser at 1440×900, 1024×768, 768×1024, 390×844, and
  375×667, no size scrolled horizontally. At phone sizes, with touch emulated (coarse
  pointer), every visible control measured at least 44px. With a fine pointer, icon
  buttons are 36px. The run covered sign-in, the root, a nested folder, an
  empty folder, a 45-item folder, long names without spaces, and folder creation
  with validation. Two uploads reached `AVAILABLE` through the tray. Original download,
  the Storage page, and keyboard focus order with the skip link also passed. After
  review repairs, a second disposable backend rechecked 390×844 and 1440×900. That
  run covered sign-in at 390×844 and the tray folding away after two uploads settled.
  A 135 MB file was refused before sending. The tray reopened with the refusal and
  the floating upload button sat above it, then moved down when the tray collapsed.
  Input borders now meet 3:1. Creating a folder with an existing
  sibling's name returned `500` instead of `409 NAME_CONFLICT`. That bug predates
  this change and is recorded as M1-13.
- Storage page (M1-09): `cd backend && ./scripts/verify.sh` passed with 87 backend tests
  (1 opt-in R2 proof skipped), OpenAPI export, TypeScript client 8 tests, and Swift
  client 9 tests, including `StorageSummaryResponse` decoding with an unknown provider
  kind. `PostgresCatalogTest` checks the exact committed sum (9,007,199,254,740,993), a
  principal in two workspaces seeing only each workspace's own versions, and zero for a
  non-member. The PostgreSQL HTTP test checks anonymous `401`, the configured display
  name, `no-store`, the exact serialized field set, no storage-root path in the body, and
  `usedBytes` staying `0` while an upload is `STAGED`, then matching after completion.
  An allow-list serialization test covers both providers and an upper-case `R2` setting. `cd web && npm test && npm run
  typecheck:run && npm run build` passed with 26 tests. Rendered against a disposable
  PostgreSQL-profile backend at 1440×900 and 390×844: signed-out redirect to sign-in;
  populated page with a 73-character display name wrapping, 700 KB stored while a
  300 KiB upload stayed `STAGED` and uncounted, and the 1 MB limit; loading while
  PostgreSQL was paused; unavailable with PostgreSQL stopped; and the error state with a
  request ID from an intercepted `500 INTERNAL_ERROR` (client fixture). No mobile
  horizontal overflow. With PostgreSQL stopped, the API returned Spring's default error
  body rather than the API error shape (recorded as ENG-13).
- Upload limits (M1-04): `cd backend && ./scripts/verify.sh` passed on Java 25.0.3 with
  PostgreSQL 17.11 through Docker Desktop 24.0.5: 83 backend tests (1 opt-in R2 proof
  skipped), OpenAPI export, TypeScript client 7 tests and Swift client 8 tests,
  including new `UploadLimitsResponse` decoding. The HTTP test configures a 50,000,000
  byte limit and checks anonymous `401`, the exposed value, `no-store`, `413 TOO_LARGE`
  at limit + 1 and `201` at the limit. `getUploadLimits` documents only `200`, `401`,
  and `500`. `cd web && npm test && npm run typecheck:run && npm run build` passed with
  20 tests, including a re-read before refusing and a re-read after `413`. Rendered against a disposable PostgreSQL-profile backend with a 1 MiB limit at
  1440×900 and 390×844: a 2 MiB file showed "Too large to upload: 2 MB is over the
  1 MB limit. Nothing was sent." with no begin request; a 64 KiB file reached
  `AVAILABLE`; a direct begin at 1,048,577 bytes returned `413 TOO_LARGE`. No mobile
  horizontal overflow.
- `cd infra/local && ./up.sh` followed by `python3 check.py`: passed on the initial
  and repeat startup. Authentik readiness/discovery, administrator OIDC sign-in,
  session-backed Catalog root access, and denial of a second Authentik user all
  passed. The repeat startup preserved the `Library` root identity. The local stack
  was left running.
- `cd backend && ./mvnw test -q`: passed, including PostgreSQL Testcontainers
  integration tests. `cd web && npm test -- --run`: passed, 14 tests. The web typecheck
  and production build passed during this slice.
- `cd backend && ./mvnw -Dtest=PostgresCatalogTest test`: passed, 13 tests, PostgreSQL
  17.11 through Docker Desktop 24.0.5.
- `cd backend && ./mvnw -Dtest=CatalogHttpTest test`: passed, 7 tests.
- `cd backend && ./mvnw -Dtest=AccessHttpPostgresTest#protectsWritesWithCsrfAndDerivesCatalogScopeFromTheAuthenticatedMembership test`:
  passed, 1 PostgreSQL Testcontainers test, including authenticated workspace-root
  resolution.
- `cd backend && ./mvnw spotless:apply -Dtest=PostgresLocalTransfersTest,LocalObjectStorageTest test`:
  passed, 14 PostgreSQL transfer tests and 4 filesystem tests. Covers whole-body retry,
  zero-byte originals, size/digest rejection, cancellation fencing, expiry, isolation,
  restart recovery, and name preservation after injected publication failure.
- `cd backend && ./mvnw spotless:apply test -q`: passed, 74 tests, no failures or
  skips on Java 25.0.3 with PostgreSQL 17.11 through Docker Desktop 24.0.5. Includes
  8 R2 PostgreSQL tests for zero/small/multipart bodies, lost provider responses,
  part-list retry, repinning before publication, stale recovery, workspace scope,
  and bounded-download behavior. V8 migration and existing local transfer tests pass.
  Read-only persistence review findings were repaired. No API shape changed;
  contract/client checks were not rerun for this slice. A real R2 run and measured
  provider streaming behavior remain outstanding.
- `cd backend && ./mvnw spotless:apply -Dtest=PostgresR2TransfersTest test -q`:
  passed separately with 10 resource-measurement tests and 11 fault tests on
  PostgreSQL 17.11 through Docker Desktop 24.0.5. The fault suite includes
  terminal-only orphan cleanup, cancellation and name-reservation checks during
  multipart creation, two provider upload IDs for one logical session, and restart
  after an empty listing before delayed creation becomes visible. The late orphan
  is aborted without losing the published object. The resource test's 9 MiB synthetic
  body through a slow/faulting injected gateway
  used 9 MiB of staged disk, then 0 after recovery. In this run, sampled JVM heap
  rose from 94.3 MB to 124.2 MB (5 ms sampling); receive took 12 ms, faulted
  completion 39 ms, reconciliation 454 ms, and verified original download 396 ms.
  The test checks the 128 MiB configured size cap, one-promotion concurrency limit,
  8 MiB maximum part, 64 KiB maximum GET read request, listed-part reuse after a
  lost response, two verification GETs, two download-path GETs, and verification/
  download timeouts. A query completed in 1 ms on the only PostgreSQL pool connection
  while a provider part call was blocked. These are local fixture measurements, not
  R2 latency, memory, disk, or compatibility evidence; the real-bucket proof remains.
- In the combined PR #1–#5 tree, `cd backend && ./mvnw spotless:apply test -q`
  passed on Java 25.0.3 with PostgreSQL 17.11 through Docker Desktop 24.0.5,
  including all 12 `PostgresR2TransfersTest` cases. The opt-in real-bucket proof
  remained skipped.
- `cd backend && ./scripts/generate-clients.sh && ./scripts/check-clients.sh`: passed
  against the exported contract; OpenAPI validation, generated TypeScript compilation
  and 6 decoding tests (including `workspace-root`), plus generated Swift compilation
  and 7 decoding tests all passed.
- `cd web && npm test && npm run typecheck:run && npm run build`: passed with 14
  transport/data/transfer tests, strict TypeScript, and a production SPA build. Tests
  include empty/binary bodies, lost begin/completion responses, whole-body retry,
  cancellation during a pending PUT, CSRF rotation, and download bytes/failure.
- Production web build inspected in Chrome 153.0.8010.50 at 1440×900 and 390×844 with
  synthetic intercepted HTTP responses and reduced motion. Browser checks exercised
  failed upload/retry, reconciliation, folder navigation, availability refresh, and
  browser download; long names wrapped without horizontal overflow. This is client
  fixture evidence. Fresh read-only review found
  no remaining blockers after cancellation and CSRF recovery repairs.
- Isolated local browser check against the actual PostgreSQL-profile backend and
  filesystem storage passed: anonymous redirect to sign-in, owner login, folder
  creation, 65,541-byte binary upload reaching `AVAILABLE`, and byte-identical
  browser download. Desktop and mobile screens were rendered at 1440×900 and
  390×844; neither had mobile horizontal overflow or browser page errors. The
  disposable test database, storage, and password were local only. After the
  sign-in change, `cd web && npm test && npm run typecheck:run && npm run build`
  passed with 15 tests, strict TypeScript, and a production SPA build.
- After merging the password sign-in page with Authentik OIDC sign-in,
  `cd backend && ./mvnw -q spotless:check test -Dtest=AccessHttpPostgresTest` passed
  10 PostgreSQL tests, and `cd web && npm test && npm run typecheck:run && npm run build`
  passed with 15 tests. Against the PostgreSQL-profile backend, anonymous `/` and
  `/library/{id}` redirected to `/sign-in`, which rendered at 1440×900 and 390×844
  without horizontal overflow and showed **Continue with Authentik** only with
  `VITE_FILEBONSAI_OIDC=authentik`. The Authentik round trip was not rerun.
- Swift generator warnings are upstream warnings; generated code was not edited.
- `cd backend && ./mvnw -q spotless:apply -Dtest=R2ProofPayloadsTest,RealR2CompatibilityProofTest test`:
  passed two local tests for deterministic payloads and fault ordering; the real-bucket
  proof was skipped by its required opt-in property. The proof script rejected missing
  settings before Maven.

## Ordered work

1. Cloud transfer: run the decision 0007 compatibility proof against a disposable
   real Cloudflare R2 bucket, repair any provider mismatch, and record bounded
   streaming/recovery evidence before claiming R2 support or adding another provider.
2. Web library, in this order: the inspector with the fields the API already returns
   (LIB-06), in-browser preview of originals (PRV-09), server-side sort (LIB-03)
   then table/grid views (LIB-04), and the inspector's integrity fields (LIB-14).
3. iOS Catalog remains deferred by user preference. When resumed, implement the
   SwiftUI/TCA slice through a generated transport and handwritten application adapter.

Each item is split into a bounded task at execution time with owned paths, dependencies,
acceptance criteria, checks, and a handoff. The ordered list is not blanket authority
  to start later work or a substitute for the current task request.

## Unresolved decisions

- Native authentication/session behavior for foreground and background transfers.
- R2 credential delivery/rotation and operational bucket provisioning; decision 0007
  selects the first provider and its initial server-mediated transfer contract.
- Configurable-shell schema, precedence, persistence, and delivery milestone.
- JavaScript workspace manager, generated-client packaging, and Swift generator path.
- React Query/Zustand roles beyond the initial React Catalog application.
- License, contribution/release conventions, supported deployment matrix, backup/
  restore format, retention rules, sharing semantics, and resource limits.
- Service decomposition, deployment platform, and infrastructure-as-code remain
  deferred until concrete operational pressure exists.
