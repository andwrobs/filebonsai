# Storage, transfers, processing, and recovery

## Trust and storage boundaries

The Filebonsai server is trusted with plaintext content and operator-supplied storage
credentials. Credentials are resolved server-side and never returned in ordinary DTOs,
logs, screenshots, or task evidence. Arbitrary provider endpoints are privileged
configuration because connection tests can become server-side request forgery.

User filenames are metadata. Internal immutable object identifiers choose storage
locations. The local adapter runs under an unprivileged account with an explicit data
root and defends against traversal and symlink escape. Upload processing is streaming
and bounded by configured size, memory, duration, and concurrency limits.

## M1 upload protocol

The default maximum is 128 MiB and default expiry is 24 hours; both are configurable.
Zero-byte files are valid. Expected SHA-256 is optional, but the server computes and
verifies size and SHA-256 before publication.

1. Begin upload persists intent and atomically reserves a name, entry, version, object
   identity, and session before external I/O.
2. PUT content acquires a lease/fence and streams to an attempt-specific temporary file
   on the same filesystem as the final destination while computing size and digest.
3. A verified body becomes `STAGED`. An interrupted or mismatched body returns to
   `INITIATED` after safely discarding only that owned attempt.
4. Completion persists `FINALIZING` before promoting bytes atomically without overwrite.
5. A short catalog transaction records `AVAILABLE` and the current-version pointer.
6. An uncertain result becomes `RECONCILING`; restart inspection of accepted temporary
   and final bytes repairs the catalog or returns to a recoverable state.

PostgreSQL and the filesystem do not share a transaction. No database transaction may
span body streaming, promotion, or provider calls. M1 retries resend the entire body
from byte zero on the same upload session; it is not offset resume.

## Upload states

`INITIATED → RECEIVING → STAGED → FINALIZING → AVAILABLE` is the happy path.
`FINALIZING → RECONCILING` handles uncertain completion. Reconciliation may move to
`AVAILABLE` after verified repair, back to `STAGED` when the accepted temporary body
still exists but no final object does, or to terminal `FAILED` when neither can be
recovered. `INITIATED`, `RECEIVING`, and `STAGED` may be fenced into terminal
`CANCELLED` or `EXPIRED`; cancellation conflicts after finalization starts.

Terminal states are `AVAILABLE`, `CANCELLED`, `EXPIRED`, and `FAILED`. Identical staged
content may replay without mutation; completion of an available upload and cancellation
of a cancelled upload return existing state. A stale writer can never publish over the
accepted attempt. Cleanup never deletes bytes involved in uncertain finalization.

## First cloud transfer: Cloudflare R2

Decision [0007](../decisions/0007-first-cloud-provider-r2.md) selects R2's S3 API.
The initial adapter keeps the M1 server-streamed upload and whole-body client retry
contract. A verified local temporary body is the durable source for R2 part retries
and restart recovery; it is removed only after cloud publication is resolved. This
avoids exposing signed URLs or provider upload IDs to clients. No bucket CORS policy
is needed for this server-to-R2 path.

For a body of at most 8 MiB, including zero bytes, the server uses a single PUT. For
larger bodies, it initiates a multipart upload and sends uniform 8 MiB parts, except
the final part. The server persists a new generated key and fence before each R2
initiation, then persists the provider upload ID and accepted part numbers and ETags
as responses arrive. If initiation times out, the key is retired; an empty multipart
listing does not prove the create call failed, and a retry uses another key. Recovery
lists multipart uploads under retired keys and aborts discovered orphans. On restart,
it lists parts for a known upload ID and compares them with the retained source before
retrying missing or uncertain parts. A replacement attempt uses a new key and upload
ID, so a late completion cannot overwrite its object. The catalog publishes only the
fenced, verified attempt. Cancellation and expiry abort only their owned uploads;
cleanup never deletes a key whose completion is still uncertain.

Before completing multipart, the server has verified the staged body's size and
SHA-256. A successful or uncertain provider completion is followed by a HEAD check
and a full GET digest check before the short catalog transaction records `AVAILABLE`.
An R2 ETag is not accepted as a full-object digest. If completion times out, recovery
first inspects the generated key; when no verified object exists, it inspects the
persisted multipart upload and retries completion or safely aborts. It keeps the
name reservation pinned while the outcome is uncertain. No transaction spans an R2
call or local file I/O.

The single-PUT path follows the same publication check. When its response is lost,
recovery HEAD/GET-verifies that call's key. An absent object may still be an in-flight
success, so a retry retires that key and uses a new one. Late objects at retired keys
are never published and are cleaned up only after their outcome is safe to resolve.

The [operator runbook](../development/local-setup.md#first-disposable-r2-compatibility-proof)
describes the first disposable real-bucket proof. It must exercise multipart creation,
part listing and retry, completion, abort, size/digest rejection, zero-byte upload,
download, restart, delayed create after an empty listing, duplicate upload IDs for
one logical session, lost single-PUT success, and timeout-after-success reconciliation.
It must record bounded memory, time, size, and concurrency behavior for local staging,
part retries, verification GET, and original download. PostgreSQL-backed tests must
cover durable fences and part state, name reservation, workspace scope, cancellation
races, and restart publication. API documentation and emulator tests alone do not
establish provider support. The initial cloud upload cap is 128 MiB until larger
transfers have measured resource and recovery behavior.

### Repeatable real-bucket proof

`backend/scripts/run-r2-proof.sh --live-disposable-bucket` runs the opt-in
`RealR2CompatibilityProofTest` against the production S3 adapter, a fresh PostgreSQL
container, and synthetic payloads. Set `FILEBONSAI_R2_PROOF_ACCOUNT_ID`,
`FILEBONSAI_R2_PROOF_JURISDICTION` (`default`, `eu`, `us`, or `fedramp`),
`FILEBONSAI_R2_PROOF_BUCKET`, `FILEBONSAI_R2_PROOF_ACCESS_KEY_ID_FILE`, and
`FILEBONSAI_R2_PROOF_SECRET_ACCESS_KEY_FILE`. The two credential values are read from
files; the script never accepts them as command arguments. Use a disposable bucket and
bucket-scoped Object Read & Write credentials. The runner creates a random workspace
prefix, checks it is empty, and deletes only objects and multipart uploads under that
prefix. A failed cleanup is a failed proof and needs operator inspection of the
disposable bucket before it is discarded.

The pinned synthetic bodies are 0 bytes (SHA-256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`),
4,096 bytes (`d67c656e01756650d77717b0839985a056ec28ffe174601d690fc407a2ceffca`),
and 9,437,184 bytes (`5a9ed69fb98cb8ce976ff50dd58c64f3ad76ea56e5591551ad232a0c499d937d`).
Each byte is its zero-based offset modulo 251. The run covers zero-byte and small PUT,
multipart part listing after a lost response, completion after a lost response, a
late multipart create after an empty listing, a second attempt for the same logical
session, orphan abort, direct abort, size/digest rejection, full download digest,
and service reconstruction over the same PostgreSQL and staging data. Faults are
injected *after* successful real provider calls, except delayed create, which is
executed after its initial empty listing. This tests recovery around uncertain
responses and the one-reader download permit but does not simulate the provider's
network timing or process death.

Successful `R2_PROOF` lines give each scenario's size, pinned digest, elapsed time,
sampled JVM heap peak, sampled staging bytes, largest request body, bytes
streamed from R2, and observed maximum simultaneous gateway calls. They contain no
credentials, provider keys, upload IDs, bucket names, or local paths. Preserve those
lines plus the command exit code and runtime versions as evidence. The sampled heap
and staging values are observations, not exact high-water marks or hard resource limits.
The 10 ms staging sample can miss short-lived writes during rejected receives. Record
process RSS, temporary-disk high-water mark, network transfer totals, and provider-side timing
separately during the live run before claiming bounded operational behavior. The
runner does not prove a process was killed and relaunched; its restart check rebuilds
the services over durable PostgreSQL and staging state. A separate process-restart
drill is still needed for that claim. Local fixture tests and injected gateways do
not establish R2 compatibility.

## Future processing work

Derived previews begin only from a committed immutable version through durable work.
Processor selection validates type and configured budgets; execution constrains CPU,
memory, time, temporary storage, output, and network. Derived assets record processor
version and inherit source authorization. Preview failure never changes original
availability. Image thumbnails come before PDF, office, or video adapters.

## Recovery contract

Recoverability includes catalog, logical names and hierarchy, immutable objects,
required credentials/keys, an open export manifest, and a verified restore procedure.
Recreating opaque bytes is not a successful restore. Schema upgrades preserve logical
identities, permissions, and pointers. Replication and synchronized deletion do not
replace an independently retained backup.
