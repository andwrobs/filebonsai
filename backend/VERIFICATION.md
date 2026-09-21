# Observed verification

Updated 2026-09-20. These are demonstrated results, not production-readiness claims.

## PostgreSQL persistence check

Command: `./mvnw -B -ntp -Dtest=PostgresCatalogTest test`

Passed: 13 tests against PostgreSQL 17.11 in Docker Desktop 24.0.5. Flyway validated and applied migrations V1–V6. The suite covers workspace/member scoping, C-collated ordering and cursors, live/expired reservations, durable and expiring idempotency, rollback, same-key and competing-name concurrency, immutable entry identity/kind and versions/objects, domain name/root constraints, root protection, and jOOQ-to-migrated-column metadata drift.

## Integrated check

Command: `./scripts/verify.sh`

The workflow performs these steps in order:

1. Runs the Maven test suite and enforced Spotless check.
2. Exports Springdoc OpenAPI plus representative JSON responses.
3. Validates the schema and regenerates TypeScript Fetch and Swift clients with pinned OpenAPI Generator 7.25.0.
4. Compiles the generated clients and runs their compatibility tests.

| Check | Result |
| --- | --- |
| Java compilation (`--release 21`) and formatting | Passed |
| Java test suite | 44 passed (18 fixture, 7 Catalog HTTP, 6 Access/PostgreSQL HTTP, 13 Catalog/PostgreSQL) |
| PostgreSQL persistence tests | 13 passed; PostgreSQL 17.11/Testcontainers |
| OpenAPI validation and generation | Passed; 7 Access and Catalog paths |
| TypeScript generated-client checks | 5 passed |
| Swift generated-client checks | 6 passed |

The client suites cover discriminated entry decoding, root `parentId: null`, exact `sizeBytes` above JavaScript's safe integer range, empty pagination, fractional timestamps, authenticated-session expiry decoding, additive error fields, future error codes, and unknown entry discriminators.

## Environment observed

- Maven wrapper: 3.9.11
- Java runtime used: Temurin 25.0.3; compilation targets Java 21
- Node: 23.7.0
- npm: 10.9.2
- Swift: 6.2.1
- OpenAPI Generator: 7.25.0 with checksum verification

JDK 21 itself has not yet been exercised locally or in CI. The result proves the Java 21 source target on JDK 25, not a complete JDK matrix.

## Known limitations

- The fixture profile uses fixed identity and in-memory state. The PostgreSQL profile
  proves local-owner browser authentication and membership-derived Catalog scope, but
  native session behavior, storage, uploads, and restart/reconciliation workflows are
  not implemented.
- The `swift5` generator is deprecated upstream. Generated code compiles and its tests pass under Swift 6.2.1, but emits upstream warnings about a retroactive `String: CodingKey` conformance and Sendable annotations. Generated code was not hand-edited.
- TypeScript's generated union decoder returns an unknown discriminator as an opaque object, while Swift throws. The harness records both behaviors; application adapters must retain a fallback path rather than assume exhaustive server evolution.
- The integrated check may download Maven/npm/SwiftPM dependencies and the pinned generator on a cold machine.
