# Backend architecture

The backend is a Java 21 modular monolith. Organize by capability first, then by boundary:

```text
com.filebonsai
├── catalog/
│   ├── domain/
│   ├── application/
│   ├── web/
│   ├── persistence/
│   └── support/
├── access/          (identity, membership, session, authorization)
├── transfers/       (upload intent, state, reconciliation)
├── storage/         (object-storage port and provider adapters)
├── processing/      (durable jobs and derived assets, when introduced)
├── operations/      (health, audit, export, backup/admin surfaces)
└── platform/        (only genuinely cross-capability infrastructure)
```

Domain types do not depend on Spring, Jackson, OpenAPI, or jOOQ. Application packages expose operation-shaped use cases and ports. Web owns public DTOs, controllers, validation, and springdoc annotations. Persistence maps jOOQ records into domain/application values and never exposes generated records. Support contains explicit fixture/test adapters.

Keep API DTOs, domain values, and persistence records distinct even when they represent related data. Logical entries, immutable versions, and physical objects are separate concepts; user filenames are metadata and never storage paths or object keys.

The backend has one executable module today. Do not add a root Maven aggregator until a second build module creates a concrete need.
