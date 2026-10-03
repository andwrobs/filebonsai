# Metadata and discovery

Find files by what they contain and what people know about them, while preserving the original.

## Recommended strategy

**Use PostgreSQL for interactive reads and user edits; preserve embedded metadata in immutable originals.** Reading every file on every browse/search would tie responsiveness to provider availability, retrieval cost and parser work. Storing only in files would also lose concepts that many formats cannot represent. Keeping only a database without portable exports would make migration unnecessarily fragile. This is a recommendation for MET-01, not an accepted schema or parser choice.

| Information | Recommended authority and lifetime |
| --- | --- |
| Original bytes, embedded EXIF/IPTC/XMP | Immutable FileVersion; download unchanged; never rewrite in place |
| Verified size and SHA-256 | Existing verified version/object model; never replace with embedded claims |
| Extracted dimensions, camera/exposure, duration, document properties | Rebuildable version-bound PostgreSQL projection with extractor/schema version and provenance |
| User descriptions, tags, ratings, capture-time/location corrections | Durable revisioned annotations; explicit entry-versus-version scope; never overwritten by extraction |
| Album membership, ordering, favorites, archive | Application relationships/state; not inferred from object keys or a loose tag bag |
| Search vectors, thumbnail pointers, map bins | Rebuildable projections; source permissions checked on every read |
| Portable interchange | Original plus XMP for supported fields and a versioned manifest for app-only relationships; export revision and source digest tie them together |

Use typed indexed columns for frequently filtered fields, normalized relationship tables for tags/albums, and bounded allow-listed JSONB only for infrequent format-specific facts. Avoid an unrestricted raw EXIF dump or a generic entity-attribute-value schema. Separate private location from ordinary metadata responses. New custom fields wait for MET-08.

Effective values should resolve from an explicit user override, then an imported sidecar according to a reviewed precedence rule, then extraction. “Clear this value” must differ from “remove my override.” Keep original value, source, precision, extractor version and edit revision available to explain disagreements. Never invent a timezone for camera-local timestamps; separate capture, upload and filesystem dates. A new content version needs fresh extraction and an explicit rule for carrying annotations forward.

An unchanged original can contain GPS even when JSON metadata omits it. Privacy-safe sharing therefore needs a separate sanitized rendition; unsupported formats must fail closed for that mode. An owner can deliberately request an unchanged original. Recovery export and public sharing are separate profiles; preservation of private metadata in a recovery bundle requires explicit opt-in under the current product rules.

## Existing work and research

[PR #18](https://github.com/andwrobs/filebonsai/pull/18) merged accepted [decision 0009](../decisions/0009-durable-jobs-in-postgresql.md) and [decision 0010](../decisions/0010-media-processing-isolation.md): durable jobs, a per-job sandbox for both parser tiers and a normalized field set with private GPS. MET-01 extends that accepted model; it does not replace its parser/sandbox decision or delay PRV-04's basic extraction behind a general metadata framework. PRV-04 owns the first extractor; this epic owns corrections, provenance, querying and portability.

Sources checked 2026-09-28: [Immich XMP sidecars](https://docs.immich.app/features/xmp-sidecars/) demonstrate selective database import and sidecar interchange; [PostgreSQL JSON types](https://www.postgresql.org/docs/current/datatype-json.html) support combining relational structure with indexed JSONB. These inform the recommendation, not a claim of Filebonsai implementation.

See [the backlog index](README.md) for pickup, checks and retirement rules.

## MET-01 Decision: metadata authority and provenance

`P1` · `M` · Decision · Backend, Docs

Depends on: none

**Why.** Photo extraction alone does not decide what happens when someone corrects its results.

**Outcome.** Propose the hybrid model above, a field dictionary, scope/lifetime matrix, effective-value precedence and migration/export rules. Compare reading originals on demand, database-only and hybrid storage. Build on accepted decision 0010 from PR #18 and use the next unused decision number for annotation authority and portability.

**Acceptance**

- Walk through wrong camera time, conflicting XMP, user-cleared GPS, replacement content and re-extraction without losing an edit.
- Specify supported fields and which can be searched, edited, exported, shared or logged; distinguish copyright/creator from sensitive owner identifiers.
- Define unknown, invalid, absent, unsupported, pending and failed states; list representative API examples without authoring an OpenAPI file.

**Settle first.** Annotation scope for each field; sidecar precedence; recovery-export privacy defaults; how explicit user location overrides interact with decision 0010's accepted (0, 0) extraction sentinel; any change to extraction needs a deliberate amendment supported by evidence.

**Invariants:** INV-01, INV-03, INV-11, INV-12, INV-13

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `decision-review`

## MET-02 Revisioned annotations and effective metadata API

`P2` · `L` · Build · Backend · Public API change

Depends on: [MET-01](#met-01-decision-metadata-authority-and-provenance), [ORG-01](organize.md#org-01-decision-how-entries-change), [PRV-04](previews-and-media.md#prv-04-photo-metadata-extraction)

**Why.** People must be able to correct dates and descriptions without changing the original.

**Outcome.** Implement the accepted annotation model, source/provenance reads and effective metadata queries. Reuse ORG-08 tags and ORG-13 notes when present; do not introduce a second description field. Split persistence/merge semantics from HTTP at pickup.

**Acceptance**

- PostgreSQL tests prove extraction refresh preserves overrides and clearing GPS does not reveal extracted GPS again.
- Concurrent edits conflict predictably; replays produce one effect; a new version cannot receive a stale extraction result.
- Another workspace cannot read annotations or private-location fields; downloads retain original digests.

**Settle first.** Adopt the accepted MET-01 field scope; explicitly map pre-existing notes and tags.

**Invariants:** INV-01, INV-03, INV-05, INV-09, INV-12

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`

## MET-03 Metadata inspector and bulk corrections

`P2` · `M` · Build · Web

Depends on: [MET-02](#met-02-revisioned-annotations-and-effective-metadata-api)

**Why.** A rich inspector should explain facts and make fixing them fast.

**Outcome.** Extend the existing inspector with capture/camera/exposure, document/media properties, provenance disclosure and edits. Add a bulk date-shift/location-clear flow with preview and per-item results.

**Acceptance**

- Missing values display as unknown; local camera times never silently become UTC.
- A bulk date shift previews old/new values and preserves each original offset; partial failures remain selected.
- Conflicts preserve unsaved input; remove-override and clear-value actions have distinct labels; undo uses revisions.

**Settle first.** First editable field set and maximum batch size from MET-01; keep technical provenance collapsed by default.

**Invariants:** INV-01, INV-14

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `web`; `rendered`

## MET-04 Portable sidecar import and metadata export

`P2` · `L` · Build · Backend · Public API change

Depends on: [MET-02](#met-02-revisioned-annotations-and-effective-metadata-api), [REC-03](integrity-and-recovery.md#rec-03-decision-export-format), [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer)

**Why.** Users should be able to leave Filebonsai without losing their curation.

**Outcome.** Import bounded XMP sidecars and export originals, supported XMP fields and a versioned manifest of app-only data. Preserve source association by version/digest; use the recovery export format instead of a rival archive format. Split import and export at pickup.

**Acceptance**

- Round-trip descriptions, corrections and tags; extend fixtures for albums once PHO-03 exists.
- Ambiguous filenames and duplicate sidecars produce a review report, never a silent match; disable XML external entities and remote references.
- Do not claim JSONB preserves unknown XML: retain an authorized bounded source sidecar or explicitly report unsupported fields.
- Export records metadata revision, digest and privacy profile; originals remain byte-identical and edits are portable.

**Settle first.** XMP namespaces and merge rules; original sidecar retention; manifest treatment of fields with no standard equivalent.

**Invariants:** INV-02, INV-03, INV-13, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; synthetic import/export round trip

## MET-05 Faceted metadata search

`P2` · `L` · Build · Backend, Web · Public API change

Depends on: [LIB-07](everyday-library.md#lib-07-name-search), [MET-02](#met-02-revisioned-annotations-and-effective-metadata-api)

**Why.** Name search cannot answer “photos from this camera last summer” or “large PDFs I archived.”

**Outcome.** Compose typed filters for kind, size, capture/upload/modified date, camera, tags and archive state with name search. Add album filters when PHO-03 exists. Share the query model with saved views and Tidy rather than duplicating it.

**Acceptance**

- Filter combinations, missing values, date bounds and cursor/query mismatch have PostgreSQL tests.
- No counts, suggestions or facet values leak another workspace or trashed entries.
- Record query plans and p95 latency on 100,000 synthetic entries; choose a budget before implementation and show indexing/pending status.
- Back/forward and shared owner URLs restore filters without placing private GPS or credentials in URLs.

**Settle first.** Case/accent rules and supported filter grammar; use PostgreSQL first and justify any additional search service with measurements.

**Invariants:** INV-01, INV-12, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; `web`; `rendered`

## MET-06 Document text extraction and local OCR

`P3` · `L` · Build · Backend, Web · Public API change

Depends on: [MET-05](#met-05-faceted-metadata-search), [PRV-10](previews-and-media.md#prv-10-processing-sandbox-container), [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer)

**Why.** People often remember a phrase inside a scan rather than its filename.

**Outcome.** Add bounded text extraction for an explicit first document set and opt-in local OCR for image-only documents. Index text with source version and processor version; show safe snippets and pending/unsupported states.

**Acceptance**

- Hostile or encrypted documents fail within budgets and originals remain available.
- Trash, access revocation and version changes remove stale results/snippets; no remote OCR or AI account is required.
- Measure storage, CPU and latency with a synthetic multilingual corpus; document languages and accuracy limits.

**Settle first.** Accepted sandbox implementation, first formats/languages and per-workspace opt-in; split extraction and search UI at pickup.

**Invariants:** INV-01, INV-07, INV-12, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; `web`; `rendered`; processor budget fixtures

## MET-07 Metadata reprocessing and coverage dashboard

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: [MET-02](#met-02-revisioned-annotations-and-effective-metadata-api), [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer)

**Why.** Operators need to distinguish missing metadata from a stalled parser.

**Outcome.** Expose safe coverage counts by outcome/format and bounded owner-requested re-extraction. Reuse PRV-04 version stamping and sweeps; show job progress, cancel and retry for infrastructure failures.

**Acceptance**

- A parser-version bump can be resumed after restart; duplicate queueing does not multiply work.
- Reprocessing never overwrites annotations and does not retry permanent malformed-file failures forever.
- A paused processor reports an honest state without blocking uploads; logs omit private raw metadata.

**Settle first.** Per-workspace concurrency and queue budgets; use ENG-05 job administration rather than building another scheduler.

**Invariants:** INV-09, INV-10, INV-11, INV-14, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; `web`; `rendered`

## MET-08 Decision: typed custom metadata fields

`P3` · `M` · Decision · Backend, Docs

Depends on: [MET-01](#met-01-decision-metadata-authority-and-provenance), [MET-05](#met-05-faceted-metadata-search)

**Why.** Projects may need fields such as document status or equipment ID without corrupting core metadata.

**Outcome.** Evaluate workspace-owned typed fields (text, number, date, enum) with stable IDs, validation, indexed-query limits and export support. Recommend a narrow first use case or defer until demand exists.

**Acceptance**

- Compare typed columns/definitions plus bounded values against arbitrary JSON and EAV; include migration and query costs.
- Define rename/delete semantics, permission boundaries and how unsupported fields survive export.

**Settle first.** First concrete user workflow, maximum fields and indexing budget; no scripting or computed expressions initially.

**Invariants:** INV-01, INV-13, INV-15, INV-16

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `decision-review`

## MET-09 Privacy-safe media downloads

`P2` · `L` · Build · Backend, Web · Public API change

Depends on: [MET-01](#met-01-decision-metadata-authority-and-provenance), [PRV-02](previews-and-media.md#prv-02-image-thumbnail-pipeline), [ACC-03](access-and-sharing.md#acc-03-decision-read-only-sharing)

**Why.** Hiding GPS in an API does not remove it from an original photo.

**Outcome.** Offer a distinctly labeled sanitized sharing/download rendition with a metadata allow-list, separate from unchanged original download. ACC-04 consumes this policy; thumbnail stripping alone is insufficient.

**Acceptance**

- Synthetic GPS, camera serial, face-region and comment fixtures are absent from sanitized output under an independent metadata inspection.
- Unsupported formats cannot fall back to an original under a sanitized URL; explain the limitation.
- An owner explicitly opting to share originals sees that embedded metadata remains; reprocessing/revocation invalidates stale shared renditions.

**Settle first.** Formats, quality and metadata allow-list; preserve originals and describe any recompression.

**Invariants:** INV-01, INV-03, INV-11, INV-12, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; `web`; `rendered`; binary metadata inspection
