# 0007: Cloudflare R2 is the first cloud storage provider

Status: accepted
Date: 2026-09-22

## Decision

Implement M2 against Cloudflare R2 through its S3 API. This selects the first provider
to test and support; it does not claim that the current application already works with
R2 or that other S3-compatible services will work.

The first adapter keeps the existing authenticated, server-streamed HTTP upload and
whole-body client retry contract. The server signs R2 requests with operator-supplied,
bucket-scoped Object Read & Write credentials. It does not return provider upload IDs,
credentials, object keys, or signed URLs to clients. A verified local temporary body is
retained until R2 completion and catalog publication are resolved, so restart recovery
has an authoritative byte source. Small and zero-byte bodies use a single object PUT;
larger bodies use multipart upload. The initial multipart threshold and uniform part
size are 8 MiB, with a 128 MiB cloud upload cap for this first slice. Larger limits
need their own resource and recovery evidence.

R2's multipart ETag is not a full-object SHA-256. The server verifies the completed
object's size and streams it back to compute SHA-256 before marking the version
`AVAILABLE`. It retains the local temporary body and the name reservation while a
completion result is uncertain. Reconciliation checks the generated R2 key and the
persisted multipart state before it publishes, retries, aborts, or declares failure.
Database transactions never span R2 or filesystem I/O.

## Consequences

- The R2 endpoint is derived from a configured Cloudflare account and jurisdiction;
  arbitrary S3 endpoints are not accepted in ordinary configuration. Credentials are
  resolved server-side and scoped to one configured bucket.
- Provider upload IDs, part numbers and ETags, attempt identity, key, and completion
  phase must be durable private state. Every initiation uses a distinct generated key;
  an uncertain initiation retires its key instead of reusing it after an empty listing.
  A stale completion cannot overwrite the accepted attempt, and a stale attempt cannot
  publish or delete a newer attempt. Cancellation and expiry abort only owned multipart
  uploads, including discovered orphans.
- A lost single-PUT response is also uncertain. The server checks that request's key
  before publication and uses a new key for any retry; a late result at the retired
  key cannot replace accepted bytes.
- The first R2 slice has no browser-to-R2 requests, so it needs no bucket CORS rule or
  client-visible presigned URL. Direct browser transfer would require a separate API,
  threat-model, and UI decision.
- Cloudflare's documentation establishes candidate API behavior; support is earned by
  bounded-streaming and PostgreSQL-backed recovery tests plus checks against a real R2
  bucket, including timeout-after-success and restart recovery.

## Provider references

- [R2 upload methods, part limits, lifecycle, and ETags](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [R2 S3 operation and checksum compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [R2 credentials and jurisdiction endpoints](https://developers.cloudflare.com/r2/api/tokens/)
