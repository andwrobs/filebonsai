# Observed backend verification

Updated 2026-09-22. These are observed results, not a real-provider or production
readiness claim. The current ordering and cross-client evidence live in
[`docs/development/status.md`](../docs/development/status.md).

## Integrated backend check

`./mvnw spotless:apply test -q` passed on Java 25.0.3 targeting Java 21, with
PostgreSQL 17.11 through Docker Desktop 24.0.5. Flyway applied V1–V8. All 74 tests
passed: 18 fixture Catalog, 7 Catalog HTTP, 10 Access/PostgreSQL HTTP, 13
Catalog/PostgreSQL, 14 local transfer/PostgreSQL, 4 local storage, and 8
R2 transfer/PostgreSQL tests using an injected provider gateway. The R2 tests cover
small, zero-byte, and multipart bodies; lost create, part, PUT, and completion
responses; full-object digest rejection; pre-publication repinning; stale-session
retry; workspace scope; and bounded download behavior.

`./mvnw spotless:apply -Dtest=PostgresR2TransfersTest test -q` passed all 11
R2/PostgreSQL tests after the fault-test audit. The focused cases verify that
cleanup preserves bytes while finalization is uncertain; cancellation cannot win
after multipart creation begins or release its pinned name; two provider upload IDs
for one logical session leave only the selected object published; and a delayed
create can appear after an empty listing and a restarted worker has published under
a new key, then be aborted by terminal cleanup.

## Limits of this evidence

- No real Cloudflare R2 bucket was available for this task. The S3 API adapter,
  multipart/list/abort behavior, credential scope, and provider timeout recovery have
  not been verified against R2. An emulator or injected gateway cannot close that gap.
- Tests bound request part size and download overread; measured R2 memory, network
  duration, concurrency, and restart behavior remain part of the real-bucket proof.
- The public HTTP API shape did not change. Springdoc export and generated-client
  checks were not rerun for this backend slice; their last observed results are in
  the repository status.
- Java 21 itself was not exercised locally; compilation targets Java 21 on JDK 25.
