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
- Flyway V1–V4 define workspace membership, names/reservations, entries, immutable
  versions/objects, idempotency, checks, and PostgreSQL guarantees.
- The jOOQ PostgreSQL adapter remains behind operation ports. Its 13 Testcontainers
  tests cover workspace scope, deterministic ordering, reservations, idempotency,
  rollback/concurrency, immutable identities/versions/objects, domain constraints,
  root protection, and generated-schema drift.
- The fixture profile is the HTTP contract harness. The PostgreSQL adapter is not
  exposed through HTTP until authenticated request scope exists.

## Latest observed checks

- `cd backend && ./mvnw -Dtest=PostgresCatalogTest test`: passed, 13 tests, PostgreSQL
  17.11 through Docker Desktop 24.0.5.
- `cd backend && ./scripts/verify.sh`: passed with 38 Java tests, OpenAPI validation
  and generation, 4 TypeScript tests, and 5 Swift tests under Temurin 25.0.3 compiling
  for Java 21. JDK 21 CI is configured but was not observed in this checkout.
- Swift generator warnings are upstream warnings; generated code was not edited.

## Ordered work

1. Authentication: local-owner bootstrap, PostgreSQL-backed server sessions, rotation,
   logout/reset invalidation, CSRF, rate limits, generic failures, and a trusted
   per-request workspace scope. Workspace identity is never caller-selected.
2. Bootstrap: create the owner, membership, workspace, and protected root exactly once;
   connect the PostgreSQL Catalog HTTP profile and prove cross-workspace isolation.
3. Clients: implement the Catalog slice in React and SwiftUI/TCA through generated
   transports and handwritten application adapters; inspect rendered required states.
4. Local transfer: add bounded filesystem storage, durable upload intent/state,
   whole-body retry, reconciliation/restart tests, and original download.
5. Cloud transfer: choose and specify one provider, then prove its multipart and
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
