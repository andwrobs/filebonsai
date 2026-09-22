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

## Optional Cloudflare R2 adapter

Set `FILEBONSAI_STORAGE_PROVIDER=r2` to use the first cloud adapter. The server still
stages each verified upload under `FILEBONSAI_STORAGE_ROOT` until publication or
recovery resolves it. R2 uploads are capped at 128 MiB in this initial slice,
regardless of a higher general upload setting. The local provider remains the default.

Configure `FILEBONSAI_R2_ACCOUNT_ID`, `FILEBONSAI_R2_BUCKET`, and optionally
`FILEBONSAI_R2_JURISDICTION` (`default`, `eu`, `us`, or `fedramp`). Supply a bucket-scoped
Object Read & Write key pair through mounted files named by
`FILEBONSAI_R2_ACCESS_KEY_ID_FILE` and `FILEBONSAI_R2_SECRET_ACCESS_KEY_FILE`.
Do not place their contents in command arguments, repository files, or logs. The
server derives the jurisdiction-specific R2 endpoint from the account ID; it does
not accept an arbitrary endpoint. `FILEBONSAI_R2_API_CALL_TIMEOUT` defaults to five
minutes, `FILEBONSAI_R2_CLEANUP_INTERVAL` to one hour, and
`FILEBONSAI_R2_RECOVERY_INTERVAL` to one minute. Stale finalizations become eligible
for periodic recovery after `FILEBONSAI_R2_RECOVERY_IDLE` (30 minutes by default,
never less than twice the configured maximum transfer duration).

The R2 code and local fault tests do not establish provider compatibility. Before
using R2 for valued data, run the real-bucket multipart, checksum, cancellation, and
restart recovery proof described in
[storage and transfers](../architecture/storage-and-transfers.md).
