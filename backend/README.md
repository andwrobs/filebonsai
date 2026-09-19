# Filebonsai backend — Catalog vertical slice

Java 21 / Spring Boot 3.5.16 / springdoc 2.8.17.

## Included

- GET /api/v1/entries/{id}
- GET /api/v1/entries/{id}/children
- POST /api/v1/folders with required Idempotency-Key UUID
- Separate file/folder DTOs, checked domain types, common HTTP errors.
- In-memory fixture with naming rules, duplicate conflicts, retry handling and signed keyset cursors.
- Flyway migrations, generated jOOQ records, and a PostgreSQL adapter behind the Catalog operation ports.
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

The PostgreSQL suite passes 13 tests against PostgreSQL 17.11. The latest integrated verification path passed with 38 Java tests, schema validation, pinned client generation, 4 TypeScript checks, and 5 Swift checks.

The fixture profile remains the contract harness. The PostgreSQL adapter is real persistence code, but its HTTP profile is intentionally gated until authentication supplies a trusted per-request scope provider. Storage, uploads, web UI, and iOS application integration remain future slices. The Swift 5 generator currently emits upstream Swift 6 concurrency/retroactive-conformance warnings and is deprecated in favor of the Swift 6 generator; migration is a separate compatibility decision. See `VERIFICATION.md` for exact evidence and limitations.
