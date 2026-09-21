# Verified status and next work

Updated 2026-09-20. This is the only live status and sequencing document. Record only
observed results; use Git history for prior plans and completed migrations.

## Current implementation

- The repository root is the Git root. `backend/` is an executable Java 21 modular
  monolith. `web/` and `ios/` are planned application roots with no client app yet.
- Catalog is organized as `domain`, `application`, `web`, `persistence`, and `support`,
  with cross-capability HTTP code under `platform/web`.
- Java controllers/DTOs author the OpenAPI contract. Pinned TypeScript and Swift
  generation is reproducible; generated output remains disposable.
- Flyway V1–V6 define workspace membership, names/reservations, entries, immutable
  versions/objects, idempotency, local-owner sessions, credential-reset replay, login
  throttling, checks, and PostgreSQL guarantees.
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
- `web/` now owns a generated `openapi-typescript` schema and a handwritten
  `openapi-fetch` service for Access and Catalog. The boundary includes cookie
  credentials, CSRF refresh/rotation handling, pagination, and caller-owned
  idempotency keys; the React UI is not implemented yet.

## Latest observed checks

- `cd backend && ./mvnw -Dtest=PostgresCatalogTest test`: passed, 13 tests, PostgreSQL
  17.11 through Docker Desktop 24.0.5.
- `cd backend && ./scripts/verify.sh`: passed with 47 Java tests, OpenAPI validation
  and generation, 5 TypeScript tests, and 6 Swift tests under Temurin 25.0.3 compiling
  for Java 21. JDK 21 CI is configured but was not observed in this checkout.
- `cd web && npm test && npm run typecheck:run && npm run generate:schema`: passed with
  5 request and representative decoding tests, a clean strict TypeScript check, and deterministic schema
  regeneration under Node 23.7.0.
- Swift generator warnings are upstream warnings; generated code was not edited.

## Ordered work

1. Clients: implement the Catalog UI in React over the TypeScript service and the
   Catalog slice in SwiftUI/TCA through a generated transport and handwritten
   application adapter; inspect rendered required states.
2. Local transfer: add bounded filesystem storage, durable upload intent/state,
   whole-body retry, reconciliation/restart tests, and original download.
3. Cloud transfer: choose and specify one provider, then prove its multipart and
   reconciliation semantics before adding another.

Each item is split into a bounded task at execution time with owned paths, dependencies,
acceptance criteria, checks, and a handoff. The ordered list is not blanket authority
  to start later work or a substitute for the current task request.

## Unresolved decisions

- Native authentication/session behavior for foreground and background transfers.
- First cloud provider and exact credential/capability contract.
- Configurable-shell schema, precedence, persistence, and delivery milestone.
- JavaScript workspace manager, generated-client packaging, and Swift generator path.
- React Query/Zustand roles once the web application exists.
- License, contribution/release conventions, supported deployment matrix, backup/
  restore format, retention rules, sharing semantics, and resource limits.
- Service decomposition, deployment platform, and infrastructure-as-code remain
  deferred until concrete operational pressure exists.
