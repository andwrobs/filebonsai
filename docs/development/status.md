# Verified status and next work

Updated 2026-09-22. This is the only live status and sequencing document. Record only
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
- The jOOQ PostgreSQL adapter remains behind operation ports. Its 13 Testcontainers
  tests cover workspace scope, deterministic ordering, reservations, idempotency,
  rollback/concurrency, immutable identities/versions/objects, domain constraints,
  root protection, and generated-schema drift.
- The PostgreSQL profile exposes authenticated Catalog HTTP through session-derived
  membership scope. Local-owner access includes secret-file bootstrap/reset,
  PostgreSQL-backed sessions, rotation/logout/reset invalidation, CSRF, persisted
  login throttling, generic failures, and secure-by-default cookies.
- Local-owner bootstrap atomically creates the principal, owner credential, initial
  workspace membership, workspace, and protected `Library` root. Repeated bootstrap
  fails without replacing the packet; restart preserves authenticated catalog access.
- The committed OpenAPI is exported from the PostgreSQL profile and includes Access
  and Catalog. The fixture profile still authors deterministic response fixtures.
- `web/` owns a React Router Catalog application over a generated
  `openapi-typescript` schema and handwritten `openapi-fetch` service. It discovers
  the session workspace root, browses direct children, navigates folders, handles
  loading/empty/error/not-found states, and exposes TanStack Form folder creation
  with caller-owned idempotency keys. The boundary includes cookie credentials, CSRF
  refresh/rotation handling, and pagination.
- Web Catalog now provides multi-file upload and original download controls. A tab-owned
  transfer store survives folder navigation, retains begin idempotency keys, checks
  durable state before whole-body retry, fences late replies after cancellation, and
  refreshes CSRF for explicit transfer operations. Sending progress is indeterminate;
  uncertain completion requires an explicit status check. Closing/reloading the tab
  does not preserve its selected files or upload tracking.

## Latest observed checks

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
  passed, 11 PostgreSQL R2 tests on PostgreSQL 17.11 through Docker Desktop 24.0.5.
  They include terminal-only orphan cleanup, cancellation and name-reservation checks
  during multipart creation, two provider upload IDs for one logical session, and
  restart after an empty listing before delayed creation becomes visible. The late
  orphan is aborted without losing the published object.
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
  fixture evidence, not a new live-backend transfer check. Fresh read-only review found
  no remaining blockers after cancellation and CSRF recovery repairs.
- Swift generator warnings are upstream warnings; generated code was not edited.

## Ordered work

1. Cloud transfer: run the decision 0007 compatibility proof against a disposable
   real Cloudflare R2 bucket, repair any provider mismatch, and record bounded
   streaming/recovery evidence before claiming R2 support or adding another provider.
2. iOS Catalog remains deferred by user preference. When resumed, implement the
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
