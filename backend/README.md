# Filebonsai backend — Catalog vertical slice

Java 21 / Spring Boot 3.5.16 / springdoc 2.8.17.

## Included

- GET /api/v1/entries/{id}
- GET /api/v1/entries/{id}/children
- POST /api/v1/folders with required Idempotency-Key UUID
- POST/GET /api/v1/uploads, PUT whole content, complete/cancel, and original download.
- Separate file/folder DTOs, checked domain types, common HTTP errors.
- In-memory fixture with naming rules, duplicate conflicts, retry handling and signed keyset cursors.
- Flyway migrations, generated jOOQ records, and a PostgreSQL adapter behind the Catalog operation ports.
- Durable PostgreSQL upload intent plus bounded local-filesystem storage, SHA-256 verification,
  atomic promotion, startup reconciliation, and authenticated attachment downloads.
- Capability-first Java packages and operation-shaped application ports.
- Strict JSON input handling, including rejection of unknown fields, duplicate keys and scalar coercion.
- Pinned Spotless/Palantir Java formatting enforced by Maven.
- Reproducible Springdoc export, pinned OpenAPI Generator, and executable Swift/TypeScript decoder checks.
- DECISIONS.md explains the implementation choices and tradeoffs.

## Run

Requires JDK 21 or newer and internet access when Maven, npm, SwiftPM, or the pinned generator dependencies are not cached.

```sh
./mvnw test
./scripts/verify.sh
./mvnw spring-boot:run -Dspring-boot.run.profiles=fixture
```

Demo root: `00000000-0000-4000-8000-000000000001`.
Server binds to `127.0.0.1:8080`. GET `/v3/api-docs` exposes springdoc output.
The explicit fixture profile supplies a fixed identity and volatile data; it is not production authentication or persistence. Java formatting can be applied with `./mvnw spotless:apply`.

`scripts/verify.sh` tests the server, exports `contract/openapi.json` plus response fixtures, regenerates disposable clients under `clients/`, and runs the TypeScript and Swift compatibility suites.

## Status

The PostgreSQL Catalog suite passes 13 tests against PostgreSQL 17.11. The latest integrated verification path passed with 44 Java tests, schema validation, pinned client generation, 5 TypeScript checks, and 6 Swift checks.

The committed contract is exported from the authenticated PostgreSQL profile; the fixture profile supplies deterministic response fixtures. Catalog and transfer scope is derived from the authenticated session's server-side membership and is never caller-selected. Web UI and iOS application integration remain future slices. The Swift 5 generator currently emits upstream Swift 6 concurrency/retroactive-conformance warnings and is deprecated in favor of the Swift 6 generator; migration is a separate compatibility decision. See `VERIFICATION.md` for exact evidence and limitations.
