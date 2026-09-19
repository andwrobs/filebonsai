# Java conventions

Status: active convention. Revisit deliberately before changing these boundaries; do not mix a structure refactor with unrelated product behavior.

## Package ownership

Organize by capability first, then by boundary inside that capability:

```text
com.filebonsai
├── catalog
│   ├── domain
│   ├── application
│   ├── web
│   ├── persistence
│   └── support
├── transfers
│   ├── domain
│   ├── application
│   ├── web
│   └── persistence
└── platform
    ├── web
    ├── database
    └── security
```

- `domain` contains valid business values and rules without Spring, Jackson, OpenAPI, or jOOQ dependencies.
- `application` contains use cases and ports. Prefer operation-shaped names such as `ListChildren`, `GetEntry`, and `CreateFolder` over a growing catch-all `*Service`.
- `web` owns controllers, public DTOs, HTTP mapping, validation annotations, and springdoc annotations.
- `persistence` owns jOOQ queries and maps generated records into application/domain types.
- `support` is for explicit dev/test adapters such as the in-memory catalog; it is never production behavior by implication.
- `platform` is reserved for truly cross-capability infrastructure. Do not use `shared` as a miscellaneous destination.

Dependencies point inward: web and persistence depend on application/domain; domain does not depend on adapters. Add an interface at a real external or replaceable boundary, not automatically for every class.

## Source conventions

- Use constructor injection and immutable fields/records where they clarify ownership.
- Keep one top-level type per file. Prefer package-private visibility until a cross-package API is needed.
- Avoid wildcard imports and compressed declarations. One statement per line; braces for control flow; names should make call sites readable.
- Public DTOs do not double as domain types or persistence records.
- Represent expected application failures explicitly and map them to HTTP only in the web boundary.
- Use named ID value types where mixing identifiers would be a real bug. Do not wrap values mechanically.
- Keep generated jOOQ and API-client sources out of authored source directories.
- Do not add Lombok. Java records and explicit constructors are sufficient for the intended style.

## Formatting and enforcement

Use the pinned Spotless Maven plugin with Palantir Java Format. Maven `validate` enforces the check, and `./mvnw spotless:apply` applies it. Do not hand-format around the engine or introduce a second Java formatter. Add ArchUnit or Spring Modulith boundary checks only when there is enough production code for those rules to protect rather than merely restate the package tree.

## Tests

- Mirror capability ownership in test packages and name tests after observable behavior.
- Use plain unit tests for domain/application rules, MockMvc or equivalent for the HTTP boundary, and PostgreSQL/Testcontainers for migrations, constraints, locking, and transaction behavior.
- A fixture adapter may prove contract shape, but it cannot prove authentication, persistence, restart, or concurrency guarantees.
