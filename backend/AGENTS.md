# Backend instructions

Inherit root `../AGENTS.md`. Before backend changes read
`../docs/development/status.md`, `../docs/architecture/backend.md`,
`../docs/development/java.md`, and the task-relevant product/API documents.

## Sources of truth

- Controllers and public DTOs under `src/main/java/` author HTTP behavior.
- `contract/openapi.json` and fixtures are reproducible Spring exports; regenerate and
  inspect them, never hand-edit them.
- `clients/` is disposable generated output. Scripts, generator versions, and client
  compatibility tests are authored inputs.
- Flyway SQL owns the schema. jOOQ output is derived and private to persistence.
- `DECISIONS.md` and `VERIFICATION.md` record backend-specific choices and observed
  guarantees without overriding repository decisions.

## Boundaries

- Organize by capability, then `domain`, `application`, `web`, `persistence`, and
  explicit test/dev `support` adapters. Use `platform` only for genuinely shared
  infrastructure; do not create a miscellaneous `shared` package.
- Keep public DTOs, domain values, and jOOQ records separate. Preserve the distinction
  among logical entries, immutable versions, and physical objects.
- No database transaction spans filesystem/provider I/O. Do not expose the PostgreSQL
  HTTP profile until authentication supplies trusted per-request scope.

## Checks and review

- Select the minimal check matrix before executing it. Use ordinary checks during
  implementation, then make one final elevated request for the remaining Docker-backed
  and contract checks. Never ask for overlapping focused and integrated checks as
  separate certifications; rerun only after a repair or expanded claim needs new
  evidence.
- Java-only change: `./mvnw test`.
- Public API, fixture, schema, generator, or client compatibility change:
  `./scripts/verify.sh`.
- Migration, constraint, transaction, scope, locking, or schema-drift claim:
  `./mvnw -Dtest=PostgresCatalogTest test` with Docker.
- Format Java with `./mvnw spotless:apply`; the build enforces the pinned formatter.
- Request fresh contract review for material HTTP changes and persistence review for
  material PostgreSQL, storage, authentication, transaction, or recovery changes.
