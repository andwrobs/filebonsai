# Local setup

## Full local stack

Run `./infra/local/up.sh` from the repository root to build and start the web client,
PostgreSQL-backed API, and Authentik through Docker Compose. Run
`python3 infra/local/check.py` to verify an Authentik OIDC sign-in and authorized
Library-root request. The first run generates local credentials and bootstraps both
the Authentik administrator and Filebonsai owner; no manual account setup is needed.
See [the local stack guide](../../infra/local/README.md) for URLs, credential-file
locations, prerequisites, and stop commands.

## Backend-only development

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

## Run the local application

From the repository root, copy `backend/config/application-dev.properties.example` to
`backend/config/application-dev.properties` and set the local PostgreSQL connection and
a fresh cursor signing secret (`openssl rand -base64 32`):

```sh
cp backend/config/application-dev.properties.example backend/config/application-dev.properties
chmod 600 backend/config/application-dev.properties
```

The filled-in file is Git-ignored and contains the database password and cursor
signing secret. Spring loads it through the `dev` profile when started by the
launcher; ordinary tests use their own settings.

To create the first owner, copy
`backend/config/application-bootstrap-local.properties.example` to the same name
without `.example`, set its password-file path, and place a 12–1024 character password
in that file outside the repository. Restrict both files to the local user:

```sh
cp backend/config/application-bootstrap-local.properties.example backend/config/application-bootstrap-local.properties
chmod 600 backend/config/application-bootstrap-local.properties
```

Run `backend/scripts/run-local.sh --bootstrap` once. Normal starts use
`backend/scripts/run-local.sh`. The launcher changes to
`backend/`, enables the `postgres,dev` profiles, and reports missing local config
files before starting Maven. The backend listens on `127.0.0.1:8080`; the web dev
server proxies `/api` there. The `dev` example disables the secure cookie flag for
local HTTP only.

The PostgreSQL profile stores local objects below `FILEBONSAI_STORAGE_ROOT` (default
`./data`). Upload defaults are 128 MiB, 15 minutes per streaming attempt, four
concurrent writers, and 24-hour intent expiry. Override them with
`FILEBONSAI_MAXIMUM_UPLOAD_BYTES`, `FILEBONSAI_MAXIMUM_UPLOAD_DURATION`,
`FILEBONSAI_MAXIMUM_CONCURRENT_WRITES`, and `FILEBONSAI_UPLOAD_EXPIRY`.

## Optional Cloudflare R2 adapter

For a disposable R2 run, copy
`backend/config/application-r2-local.properties.example` to
`backend/config/application-r2-local.properties`:

```sh
cp backend/config/application-r2-local.properties.example backend/config/application-r2-local.properties
chmod 600 backend/config/application-r2-local.properties
```

Set its account, bucket, and jurisdiction, then run
`backend/scripts/run-local.sh --r2`. This adds the `r2-local` profile to the normal
local profiles. The filled-in file is Git-ignored. Keep the
Access Key ID and Secret Access Key in the separate local files named by the example;
do not paste them into an application config file. Use `--r2 --bootstrap` together
only if the test database has no local owner yet. The launcher selects local object
storage unless `--r2` is present and uses the R2 settings from the local config file
even if a prior shell exported different R2 values. The automated R2 tests use a fake
gateway.

The server still stages each verified upload under `FILEBONSAI_STORAGE_ROOT` until
publication or recovery resolves it. R2 uploads are capped at 128 MiB in this initial
slice, regardless of a higher general upload setting.

For an environment-based deployment, set `FILEBONSAI_STORAGE_PROVIDER=r2`,
`FILEBONSAI_R2_ACCOUNT_ID`, `FILEBONSAI_R2_BUCKET`, and optionally
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
restart recovery proof below. The required behavior is specified in
[storage and transfers](../architecture/storage-and-transfers.md).

## First disposable R2 compatibility proof

Run this only against an empty, disposable bucket and a disposable PostgreSQL database.
It is an operator procedure, not evidence that a real R2 run has occurred. Keep the
database and `FILEBONSAI_STORAGE_ROOT` across application restarts; use a fresh pair
for each independent run. Use a local owner created through the mounted bootstrap
password file on the first start, then remove that bootstrap setting. Use the
authenticated web client or the [transfer API](../api/conventions.md#local-transfer-api)
with a session cookie and refreshed CSRF token. Record upload IDs and entry IDs locally
to correlate observations; never include cookies or private storage identifiers in
shared evidence.

### Prepare

1. Provision one empty bucket in the intended account/jurisdiction. Create an Object
   Read & Write key restricted to that bucket. Mount its access-key ID and secret in
   separate, process-readable secret files outside the repository. Set
   `FILEBONSAI_R2_ACCOUNT_ID`, `FILEBONSAI_R2_BUCKET`,
   `FILEBONSAI_R2_ACCESS_KEY_ID_FILE`, `FILEBONSAI_R2_SECRET_ACCESS_KEY_FILE`, and
   `FILEBONSAI_R2_JURISDICTION` if needed. Do not print either file, pass a secret in
   a command argument, or capture environment dumps. Use `postgres` with
   `FILEBONSAI_STORAGE_PROVIDER=r2`; keep `FILEBONSAI_STORAGE_ROOT` on a volume that
   survives a process restart. Start from `backend/` with
   `./mvnw spring-boot:run -Dspring-boot.run.profiles=postgres` after configuring the
   PostgreSQL connection and local-owner access described above. Confirm the app can
   authenticate and resolve `GET /api/v1/catalog/root` before testing uploads.
2. In a scratch directory outside the repository, generate deterministic synthetic
   bodies and record only their filenames, sizes, and SHA-256 values:

   ```sh
   python3 - <<'PY'
   from pathlib import Path
   import hashlib
   fixtures = {'empty.bin': 0, 'small.bin': 1024, 'multipart.bin': 9 * 1024 * 1024,
               'limit.bin': 128 * 1024 * 1024}
   for name, size in fixtures.items():
       digest = hashlib.sha256()
       with Path(name).open('wb') as output:
           remaining = size
           while remaining:
               chunk = bytes([0x53]) * min(1024 * 1024, remaining)
               output.write(chunk)
               digest.update(chunk)
               remaining -= len(chunk)
       print(name, size, digest.hexdigest())
   PY
   ```

3. Before fault cases, prepare a disposable, single-use fault decorator around
   `R2Gateway` (see `backend/src/main/java/com/filebonsai/storage/R2Gateway.java`).
   It must call the real `S3R2Gateway` and be able to throw `IOException` **after** a
   successful `put`, `createMultipart`, `uploadPart`, or `completeMultipart` call; it
   must also be able to pause immediately after a successful call so the JVM can be
   stopped before the caller persists the response. For the delayed-create case, it
   must be able to hide one real `listMultipartUploads` result from the application,
   then pass through later listings. Arm one fault for one upload at a time. Do not
   change the configured endpoint, use a mock provider, log provider
   keys/upload IDs, or ship the diagnostic decorator. A network timeout alone does
   not establish that R2 completed the operation; confirm the provider outcome in
   the bucket before calling it timeout-after-success.

### Exercise in order

For each new upload use a unique synthetic filename and idempotency UUID. Begin with
the exact decimal `sizeBytes` and recorded SHA-256, PUT the whole body, then complete
unless the row below says otherwise. A retry always resends the whole body from byte
zero. After each step, read `GET /api/v1/uploads/{id}`; inspect the matching
`upload_sessions`, `r2_attempts`, `r2_parts`, and `r2_objects` rows in the disposable
database and the corresponding object/multipart state in the bucket. Keep provider
keys and upload IDs in the local inspection only. `AVAILABLE` requires one pinned R2
object plus one committed file version/current-version pointer; a staged or uncertain
upload must have no published catalog file.

| Step | Action | Expected upload, database, and R2 outcome |
| --- | --- | --- |
| 1 | Upload `empty.bin` and `small.bin`; download both via `GET /api/v1/entries/{id}/content`. | Each goes `STAGED` then `AVAILABLE`; one verified R2 object and one catalog version per entry, exact downloaded size and SHA-256. No multipart upload. |
| 2 | Upload `multipart.bin`; inspect after PUT and completion. | `STAGED` has local bytes and no R2 object; completion creates a multipart upload with two parts (8 MiB, 1 MiB), then one verified object and one `AVAILABLE` version. Compare the downloaded digest; do not use the multipart ETag as SHA-256. |
| 3 | Begin separate uploads with a declared size one byte too large and a wrong 64-character SHA-256; PUT the original `small.bin` bytes. | Each content request rejects the mismatch and returns the session to `INITIATED`; no R2 attempt, object, catalog version, or published name. Cancel both and confirm `CANCELLED` and released name reservations. |
| 4 | Begin and stage a separate `multipart.bin`, then cancel before completion. For another staged upload, pause completion after its first provider call and attempt cancellation. | The first is `CANCELLED`, with no provider attempt/object, catalog version, or reserved name. The second is `FINALIZING`; cancellation conflicts and leaves its bytes/name intact. Release the pause and let completion resolve. |
| 5 | Inject a lost response after a real multipart part succeeds; restart the process with the same database and staging root. | Completion becomes `RECONCILING`; the multipart upload and retained staged bytes survive. Startup reconciliation lists the accepted part, retries only missing parts, verifies the completed object, and reaches one `AVAILABLE` version. Compare part count and digest. |
| 6 | Inject a lost response after real multipart completion succeeds, then restart. | `RECONCILING` retains bytes and pinned name; startup HEAD/GET verification recognizes the existing object and publishes once. Repeated completion returns the same `AVAILABLE` version without a second accepted object. |
| 7 | Repeat the lost-response/restart check for a successful single PUT. | The same key is verified and published once. If a retry creates a second attempt, its key differs; only the verified pinned attempt backs the catalog version. |
| 8 | Lose the response after multipart creation. Hide the first real multipart listing once, then let later listings reach R2. Restart and allow recovery and orphan cleanup to run after their configured grace periods. | The application sees an empty listing, then the old upload becomes visible. A retry uses a different key/upload ID for the same logical session; only the accepted attempt publishes. The old upload is eventually found and aborted after the session is terminal; no retired object is served or left indefinitely. Record that the empty result was injected, not a claimed R2 consistency behavior. |
| 9 | On another staged multipart upload, pause immediately after successful provider completion and stop the JVM before the gateway returns. Restart with the same database and staging root. | The session remains `FINALIZING` at shutdown, with no catalog version; startup reconciles the existing object to one verified `AVAILABLE` version and removes staged bytes only after publication. |
| 10 | Upload `limit.bin` with the configured single-transfer and concurrency limits, then download it. | Size stays within the 128 MiB cloud cap; 16 parts complete, readback and download SHA-256 match, and memory/staging/connection observations stay within the chosen operating budget. A request above 128 MiB is rejected before provider I/O. |

For steps 5–8, let the injected exception reach the caller, confirm the resulting
`RECONCILING` state and actual bucket outcome, then stop and restart the app. For step
9, stop while the decorator is paused and confirm `FINALIZING` in PostgreSQL. Start
the same profile and volumes. Startup runs
`PostgresLocalTransfers.reconcile()` and orphan cleanup; periodic recovery only
claims stale finalizations after `FILEBONSAI_R2_RECOVERY_IDLE` (at least twice the
maximum transfer duration). Do not shorten the idle/grace windows to race a live
request. Keep checking until the configured recovery and cleanup windows elapse;
record any remaining `RECONCILING` session or multipart upload as unresolved.

### Record and close

For every scenario record the UTC time, fixture size/digest, HTTP status and public
upload state sequence, database counts/states (including pinned object and catalog
version), R2 object/multipart counts, downloaded digest, injected seam, restart time,
and elapsed time to resolution. At one and at the configured maximum concurrent
transfer count, sample process peak resident memory, staging bytes, open connections,
part retry counts, verification GET bytes/time, and download bytes/time; record the
configured 128 MiB, 8 MiB part, duration, and concurrency limits. These are measured
baselines, not an assertion that a low sample proves a universal bound. Redact
credentials, tokens, provider keys/upload IDs, internal paths, and signed URLs.

A pass requires every row above to match both PostgreSQL and the real bucket, correct
download digests, no duplicate catalog publication, and recorded resource evidence
within the chosen budget. A provider operation, ETag, listing, checksum, or recovery
behavior that differs from these expectations is an unresolved provider mismatch;
an unrun or uncontrolled fault case leaves the proof incomplete. Do not claim R2
support from local tests, emulator results, or a partial run.

After collecting evidence, stop the app. In the disposable bucket, list and remove
all remaining multipart uploads and synthetic objects; confirm it is empty before
removing the bucket and revoking the bucket-scoped key. Delete the disposable database,
staging volume, fixture files, and fault harness only after their evidence is no
longer needed. Never run broad deletion against a shared bucket or database.
