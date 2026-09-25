# API conventions

Java public controllers and DTOs are authoritative. Springdoc exports OpenAPI 3.0.1; generated TypeScript and Swift clients are downstream artifacts and are never hand-edited.

- IDs are canonical UUID strings on the wire and named value types in domain code.
- Timestamps are UTC ISO-8601 `Instant` values.
- Byte counts are decimal JSON strings so clients remain exact above JavaScript's safe integer range.
- Names are NFC-normalized, 1–255 UTF-8 bytes, preserve spaces, reject path separators, dot names, controls, and malformed UTF-16.
- Sibling names are case-sensitive and ordered by normalized UTF-8 bytes, then canonical UUID text.
- Cursors are opaque, signed, versioned, and scoped to the workspace/folder/sort. They are invalid after cursor-key rotation.
- Responses use explicit nullable fields; errors use `code`, `message`, `status`, `requestId`, and optional `fieldErrors`.
- Unknown request properties, duplicate JSON keys, scalar coercion, and non-canonical UUIDs are rejected.
- Name conflicts across entries and pending reservations return `409 NAME_CONFLICT`; changed idempotent intent returns `409 IDEMPOTENCY_CONFLICT`.
- Authentication uses server-side sessions persisted in PostgreSQL. The administrative
  owner bootstrap/reset reads a password interactively or from a secret file—never a
  public registration endpoint, plaintext command argument, or log.
- Login rotates the session; logout and credential reset invalidate it. Refresh CSRF
  after login and require `X-CSRF-TOKEN` on every state-changing browser request,
  including login, logout, and content upload. Deployed cookies are `HttpOnly`,
  `SameSite=Lax`, and `Secure` under HTTPS.
- Anonymous requests return `401`. Missing and inaccessible resources both return
  `404` after authentication. Invalid CSRF is `403`; validation `400`; state/name/
  idempotency conflict `409`; expiry `410`; oversized bodies `413`; rate limiting
  `429`; and retryable storage failure `503` with `Retry-After` when meaningful.
- Private metadata responses use `Cache-Control: no-store` initially. Downloads are
  authorized attachments with safe filenames, `application/octet-stream`, and
  `X-Content-Type-Options: nosniff`; M1 does not serve HTML/SVG inline or promise ranges.
- Create-folder and begin-upload require an idempotency key scoped by principal,
  workspace, and operation. Nonterminal intent does not expire merely because terminal
  result retention elapsed. Content, complete, and cancel replay against the upload
  session rather than creating new logical work.

## Local transfer API

`POST /api/v1/uploads` reserves a new filename and durable upload identity. Its JSON
body contains `parentId`, `name`, decimal-string `sizeBytes`, and nullable `sha256`.
`GET /api/v1/uploads/{id}` reads state. `PUT /api/v1/uploads/{id}/content` accepts
`application/octet-stream` and always represents a complete byte-zero attempt.
`POST /api/v1/uploads/{id}/complete` publishes verified staged bytes, while
`DELETE /api/v1/uploads/{id}` cancels only before finalization. An available original
is downloaded from `GET /api/v1/entries/{id}/content`; internal object and temporary
keys never appear in public DTOs.

`GET /api/v1/upload-limits` returns the effective `maximumBytes` as a decimal string:
the smaller of the configured staging limit and the active publisher's limit, the same
value begin-upload enforces. It requires authentication. Clients may refuse larger
files before `POST /api/v1/uploads`, but the server stays authoritative and still
returns `413 TOO_LARGE`. `maximumBytes` stays required and finite; later limits arrive
as new optional or nullable fields so existing clients keep decoding.

`UploadResponse.state` is a closed, versioned lifecycle vocabulary. Adding or
renaming a value is a breaking API change because generated clients decode it as an
enum; internal recovery markers must not become public states.

## Local access boundary

The PostgreSQL profile has one local owner. Bootstrap is an administrative startup
operation, not an HTTP registration route: set
`filebonsai.access.bootstrap.password-file` to a mounted file containing a 12+
character password for the first process start. The value is read server-side and
is never accepted as a command-line password or returned by an API. A second startup
with that setting fails instead of replacing the owner.

`GET /api/v1/auth/csrf` issues the double-submit token used in the
`X-CSRF-TOKEN` header. `POST /api/v1/auth/login` requires that token and rotates
any current opaque `FILEBONSAI_SESSION`; it returns only a principal UUID and session
expiry. `POST /api/v1/auth/logout` likewise requires CSRF and invalidates the server
record. Session records contain only SHA-256 digests of random tokens and persist in
PostgreSQL, so an application restart preserves a valid session. The session cookie
is HttpOnly, `SameSite=Lax`, and secure by default; set
`filebonsai.access.cookie.secure=false` only for an explicit loopback HTTP deployment.
Failed logins are counted in PostgreSQL for the single local owner. Five failures
within five minutes block login for fifteen minutes by default; deployments may tune
the positive `filebonsai.access.login.max-attempts`, `attempt-window`, and `lockout`
settings. A blocked login returns generic `429 RATE_LIMITED` with `Retry-After`, and a
successful login clears prior failures.

An administrative credential reset requires both
`filebonsai.access.reset.password-file` and a unique UUID in
`filebonsai.access.reset.request-id`. The request ID makes startup retry idempotent;
reuse it only for the same reset operation. A new request updates the password,
increments the credential revision, and revokes every active session atomically. The
operator removes the reset settings after the successful start; neither value is an
HTTP input.

Catalog scope is derived from the authenticated session and the server-side membership
row. No query parameter, header, or body field can choose a workspace. Until the
workspace bootstrap packet is complete, the local owner has no catalog scope; once it
exists, exactly one membership is required for this first local-owner slice.

The optional loopback Compose stack also offers Authentik OIDC sign-in. Its provider
uses the authorization-code flow. The backend validates the provider's ID token and
accepts only the pinned administrator subject, then issues the same Filebonsai
session and CSRF cookies used by local-owner login. A different Authentik account
cannot acquire the local owner's workspace scope.

These are observable product/API rules, not a requirement that every client share Java's internal types.
