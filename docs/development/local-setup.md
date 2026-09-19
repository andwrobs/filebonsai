# Local setup

The backend uses the Maven wrapper and targets Java 21. A newer JDK may compile it locally, but the declared baseline is JDK 21 and the repository has a dedicated CI workflow for that runtime.

Docker Desktop is required for `PostgresCatalogTest`, which starts PostgreSQL 17 with Testcontainers and applies the Flyway chain. The fixture-only HTTP tests do not require Docker.

From the repository root:

```sh
cd backend
./mvnw test
./scripts/verify.sh
```

The `postgres` Spring profile is intentionally gated until authentication supplies a trusted per-request `CatalogScopeProvider`; do not expose the configured persistence adapter as a universal caller identity.
