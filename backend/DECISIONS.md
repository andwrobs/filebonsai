# Catalog API decisions

This is the first verified Catalog vertical slice. Java DTOs and controller annotations are the HTTP authoring source. `contract/openapi.json` and representative fixtures are reproducibly exported by tests against the actual Spring application; Swift and TypeScript output is generated from that export. Neither the schema nor generated clients are hand-maintained.

## Implemented catalog guarantees

The active product and API documents specify NFC names, case-sensitive siblings, at most 255 normalized UTF-8 bytes, no silent trimming, reserved pending-upload names, decimal-string byte counts, deterministic name/ID keyset paging with limit 1–100, required folder-create idempotency, and stable entry identity separate from immutable versions. These are implemented in this slice. Storage verification and upload state transitions are deferred.

## Choices made here

| Question | Decision | Reason and cost |
| --- | --- | --- |
| One entry shape or variants? | `EntryResponse` is a sealed union of `FileEntryResponse` and `FolderEntryResponse`, selected by `kind: file/folder`. | A file always has a current version; folders have no irrelevant file fields. Swift requires switching over an enum; TypeScript gets a discriminated union. We accept repeated common fields in the DTO definitions to avoid inheritance complexity in generated clients. |
| Root | A real folder ID; its `parentId` is explicitly null. Requests always provide a parent ID. | No second virtual-root API or overloaded null meaning. Identity/bootstrap will eventually supply the workspace root ID. This slice documents a fixed demo root. |
| Null versus missing | Responses include nullable properties as JSON null; required values are present. Only folder `parentId` and page `nextCursor` are nullable. | Wire semantics stay deliberate. Generated optional Swift properties do not distinguish missing from null; app code should not depend on that distinction. |
| IDs | JSON UUID strings, Java DTO `UUID`, domain `EntryId`/`VersionId` wrappers. | Familiar tool support; domain wrappers prevent accidentally substituting a version for an entry. Canonical UUID structure required on input, either hex case accepted; output is lowercase. IDs are not credentials. |
| Time | UTC ISO-8601 timestamps from `Instant`. | Shared, unambiguous wire representation; no server-local dates. Clients may lose subsecond precision in native Date representations, so timestamps are not concurrency tokens. |
| Byte counts | JSON decimal string; nonnegative Java `long` internally. | Exact above JavaScript's safe integer range. Maximum is `9223372036854775807`; arithmetic uses `Math.addExact`. Schema documents the maximum; its decimal regex alone does not enforce the numerical upper bound. Response values originate in the checked domain type. |
| Name conflicts | `409 NAME_CONFLICT` across files, folders and pending reservations in the same parent. | No overwrite, implicit merge, auto-suffix, or ambiguous successful no-op. The caller can ask for another name. Case differences are distinct. |
| Name validation | Normalize to NFC, then validate 1–255 UTF-8 bytes, forbidden separators/dot names/control characters, and malformed UTF-16. | `@Size` counts Java characters, so it would misdescribe the byte rule. That rule belongs in `FileName`, with a clear field error at the boundary. Spaces are preserved, including all-space names. Unicode format characters are not blanket-banned. |
| Ordering | Ascending normalized-name UTF-8 bytes, then canonical UUID text. | Locale-independent and suitable for PostgreSQL C collation. No folders-first behavior or user-selectable sorting in this slice. Future sorts require a new bound cursor identity. |
| Cursors | Versioned Base64URL payload plus HMAC, bound to workspace/folder/sort; optional limit can change between pages. | Tampering or cross-folder reuse fails with `400 INVALID_CURSOR`. Opaque means clients must not parse or synthesize it; it is not encrypted. Fixture restart rotates the key and invalidates cursors. |
| Concurrent paging | Keyset continuation, no snapshot promise. | Insertions behind the cursor are not seen; renames can omit or repeat entries across pages. Refresh or deduplicate by entry ID. A deleted anchor does not require an offset or lookup. |
| Folder idempotency | Required `Idempotency-Key` UUID, scoped to principal/workspace/create-folder. | Same key and normalized parent/name replay the original resource and `201`/Location; changed intent gives `409 IDEMPOTENCY_CONFLICT`. Replays are checked before duplicate names. Failed creates do not reserve a key. Fixture records last until restart; PostgreSQL stores a transactionally durable 30-day record and releases expired keys. |
| Errors | One envelope: `code`, `message`, `status`, `requestId`, `fieldErrors`. Codes remain open strings. | Switch on known codes, with a default fallback for newer server errors. Never branch on messages. Unknown response properties can be ignored. Request bodies reject unknown properties, duplicate keys and scalar coercion to catch client mistakes. |
| Invalid folder target | `400 NOT_A_FOLDER`. Missing/inaccessible entry is `404 ENTRY_NOT_FOUND`. | Identifies a correctable command target error without disclosing inaccessible resources. |
| Scope | An application scope comes from a trusted provider; the fixture supplies one fixed principal/workspace. | Request parameters cannot select a different workspace. This is an adapter seam, not implemented authentication. Production must resolve scope per authenticated request. |
| API documentation dialect | OpenAPI 3.0.1, deliberately configured at the Java application source. | Its nullable/oneOf representation passes the selected generator and client decoder checks for the exported operations. |
| Generated artifacts | Commit the exported contract, fixtures, generator configuration, lockfiles, and compatibility tests. Treat `clients/` as disposable ignored build output. | Drift remains reviewable without making generated SDK source an authored surface. `scripts/verify.sh` recreates and compiles both clients. |
| Java formatting | Spotless Maven plugin 3.10.2 with Palantir Java Format 2.96.0, checked during Maven `validate`. | One reproducible formatter replaces subjective layout review. Generated clients are outside this rule. |

## Where each kind of type belongs

- `catalog/web`: requests, responses, controller and catalog-specific HTTP mapping. Java Bean Validation covers required request values and page limits; custom domain validation covers normalized names.
- `catalog/domain`: immutable valid values and entries; no Spring, HTTP, Jackson or jOOQ dependency.
- `catalog/application`: operation-shaped ports (`GetEntry`, `ListChildren`, `CreateFolder`), scope and typed failure reasons. This is the boundary the real persistence implementation will fulfill.
- `catalog/support`: explicitly in-memory adapter, simulated pending reservation, cursor machinery and fixture composition.
- `platform/web`: genuinely cross-capability JSON, error-envelope and request-correlation infrastructure.
- `catalog/persistence`: PostgreSQL/Flyway/jOOQ adapter. Database records remain private; query entry/version projections are mapped into application/domain results and never serialized directly.

Domain modeling does not imply an ORM. `FileName` ensures validity when created; `ByteCount` guards range and arithmetic; `Entry.File` cannot exist without a parent and current version. The application service then explicitly decides what changes. The fixture implements that decision under one monitor; the database version must use deliberate constraints and transactions.

## Replacing the fixture

Use the same service behavior as acceptance criteria, not its data structures as database design. The PostgreSQL adapter enforces membership on every query/mutation, uses a bytewise name uniqueness constraint including pending reservations, creates the folder and successful idempotency result in one transaction, resolves competing insert conflicts into stable API errors, and keeps ordering/cursor comparisons identical to the fixture's UTF-8 order. PostgreSQL migrations also guard immutable entry kind, roots, versions/objects, and FileName constraints.

Resolve real session/native auth before exposing the PostgreSQL HTTP profile. Add per-request scope, CSRF/session behavior for the browser, replay retention policy, request-size limits, production cursor key management, and transfer/storage tests. Catalog bytes are synthetic metadata; the fixture's large-size example is intentional and has no backing object.

No upload endpoints, storage operations, UI, JPA/Hibernate, or client applications are added to this slice. Active upload/storage and configurable-shell requirements live in `docs/architecture/storage-and-transfers.md` and `docs/product/design.md` and remain future work.

## References consulted

- Springdoc Boot compatibility and code-first configuration: https://springdoc.org/v2/
- OpenAPI Generator Swift options: https://openapi-generator.tech/docs/generators/swift5/ (`identifiableModels` is disabled because the discriminated `EntryResponse` union itself has no single `id` property)
- OpenAPI Generator TypeScript Fetch options: https://openapi-generator.tech/docs/generators/typescript-fetch/
- Spotless Maven configuration: https://github.com/diffplug/spotless/blob/main/plugin-maven/README.md
- Tool versions and observed checks are recorded in `VERIFICATION.md`.
