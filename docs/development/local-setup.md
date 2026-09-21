# Local setup

The backend uses the Maven wrapper and targets Java 21. A newer JDK may compile it locally, but the declared baseline is JDK 21 and the repository has a dedicated CI workflow for that runtime.

Docker Desktop is required for `PostgresCatalogTest`, which starts PostgreSQL 17 with Testcontainers and applies the Flyway chain. The fixture-only HTTP tests do not require Docker.

From the repository root:

```sh
cd backend
./mvnw test
./scripts/verify.sh
```

The `postgres` profile requires PostgreSQL and uses the authenticated session's
server-side membership as its `CatalogScopeProvider`; workspace identity is never a
request parameter. Create the first local owner with
`filebonsai.access.bootstrap.password-file`. For an administrative password reset,
set `filebonsai.access.reset.password-file` plus a new UUID in
`filebonsai.access.reset.request-id` for one successful start, then remove both reset
settings. Password files must contain 12–1024 characters after surrounding whitespace
is stripped.

The PostgreSQL profile stores local objects below `FILEBONSAI_STORAGE_ROOT` (default
`./data`). Upload defaults are 128 MiB, 15 minutes per streaming attempt, four
concurrent writers, and 24-hour intent expiry. Override them with
`FILEBONSAI_MAXIMUM_UPLOAD_BYTES`, `FILEBONSAI_MAXIMUM_UPLOAD_DURATION`,
`FILEBONSAI_MAXIMUM_CONCURRENT_WRITES`, and `FILEBONSAI_UPLOAD_EXPIRY`.
