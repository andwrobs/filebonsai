# Photos as a first-class library

Photos should have a home of their own: a fast chronological library, albums, a large viewer, a map and satisfying ways to curate. They remain the same FileEntries and immutable versions used by Library, Storage and sharing. An album groups references; it neither moves originals nor duplicates bytes.

This epic owns the photo home, album model and album workflows. PRV owns extraction, thumbnails and the reusable lightbox; MET owns metadata corrections/search; RFL owns the map and reflective canvas; TDY owns reviewable archive/trash batches. A conventional photo timeline should ship without waiting for an experimental canvas. Start with responsive web; native delivery remains subject to the existing iOS deferral.

A useful first demonstration: import a synthetic trip, browse by capture date, select a run of photos, add them to two albums without reopening a picker, correct a bad date, explore the map, and review an archive batch. These are candidate product outcomes, not a replacement for the ordered work in status.md.

See [the backlog index](README.md) for pickup, checks and retirement rules.

## PHO-01 Decision: photo identity and album semantics

`P1` · `M` · Decision · Backend, Web, Docs

Depends on: none

**Why.** Tags, folders, albums, bursts and file versions solve different problems.

**Outcome.** Define a photo/media projection over FileEntry, manual album membership/order/cover, archived and trashed visibility, favorites versus Reflect picks, and the treatment of versions and companion assets.

**Acceptance**

- Specify that one file can belong to multiple albums without copies and removing an album never deletes its files.
- Walk through replacement photo bytes, deleted album cover, restored photo, RAW/JPEG pair and Live Photo companions.
- Define stable identity and permission rules; no album grants access by itself.

**Settle first.** Membership follows entry or pins a version; workspace albums versus personal curation; use LIB-09/RFL-01 for favorites and picks.

**Invariants:** INV-01, INV-03, INV-12, INV-13

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `decision-review`

## PHO-02 Photos home and chronological browsing

`P2` · `L` · Build · Backend, Web · Public API change

Depends on: [PHO-01](#pho-01-decision-photo-identity-and-album-semantics), [PRV-04](previews-and-media.md#prv-04-photo-metadata-extraction), [PRV-03](previews-and-media.md#prv-03-gallery-grid-and-lightbox)

**Why.** Photos deserve an entry point beyond changing a folder to a grid.

**Outcome.** Add a capability-aware Photos destination with day/month grouping across folders, date jump, missing-date group, thumbnail grid and the existing lightbox. Introduce a bounded timeline query reused by later Reflect views.

**Acceptance**

- Capture-date fallback is labeled and stable, with UUID tiebreaks; corrections reposition items without duplicates.
- Pending extraction and unsupported previews remain visible with honest placeholders and download access.
- Record bounded page requests, memory and scroll performance for 100,000 synthetic photo records; no download of all coordinates or originals.
- Back from the viewer restores scroll, selection and filters at desktop and phone sizes.

**Settle first.** Initial date policy per MET-01 if accepted; otherwise document a narrow policy compatible with PRV-04, without inventing timezone offsets.

**Invariants:** INV-01, INV-12, INV-14, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; `web`; `rendered`

## PHO-03 Albums API and collection integrity

`P2` · `L` · Build · Backend · Public API change

Depends on: [PHO-01](#pho-01-decision-photo-identity-and-album-semantics), [ORG-01](organize.md#org-01-decision-how-entries-change)

**Why.** A fast album interface needs reliable membership and ordering operations.

**Outcome.** Create, rename, delete and list albums; add/remove members idempotently; choose cover and ordering; return bounded membership summaries. Keep this separate from folder movement and tags.

**Acceptance**

- Concurrent add does not duplicate membership; repeat remove is safe; cover cannot reference an inaccessible member.
- Trash/restore and new-version behavior follow PHO-01; deleting an album preserves entry/version/object counts.
- Other-workspace IDs are indistinguishable from missing; bulk operations report each item and revision conflicts.

**Settle first.** Batch limits, ordering keys and behavior of hidden/archived members from PHO-01.

**Invariants:** INV-01, INV-03, INV-05, INV-08

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`

## PHO-04 Fast add-to-albums and album browser

`P2` · `M` · Build · Web

Depends on: [PHO-03](#pho-03-albums-api-and-collection-integrity), [PHO-02](#pho-02-photos-home-and-chronological-browsing)

**Why.** Adding a sequence of photos to albums should not require reopening a dialog for every photo.

**Outcome.** Provide a searchable persistent album tray with pinned/recent targets, inline album creation and membership indicators. Bulk selection adds to one or many albums. The viewer can advance while keeping the tray open; album pages support cover/order changes.

**Acceptance**

- After choosing an album, each next photo can be added with one explicit button or key; pointer and keyboard flows both retain the chosen target.
- Already-added, mixed selection and partial failure are visible; removing from an album is distinct from trashing a photo.
- Undo changes only memberships created by that action, never memberships that already existed.
- A keyboard and a one-thumb phone session curate 30 synthetic photos into three albums without losing place; record interactions and friction.

**Settle first.** Pinned target count and shortcut collisions; start with non-destructive membership changes.

**Invariants:** INV-01, INV-05, INV-14

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `web`; `rendered`

## PHO-05 Album curation deck for touch and keyboard

`P2` · `M` · Build · Web

Depends on: [PHO-04](#pho-04-fast-add-to-albums-and-album-browser), [TDY-06](tidy-mode.md#tdy-06-swipe-deck-ui)

**Why.** Tinder-style review should help build collections as well as archive files.

**Outcome.** Add an album-assignment deck using Tidy presentation and the album command layer: sticky target albums, add-and-next, skip, undo and an Other album picker. Multi-album assignment is supported without moving the file.

**Acceptance**

- Buttons and visible keys cover every gesture; swiping while zoomed or scrolling the picker never changes membership.
- Keep one-step reversible album adds separate from staged archive/trash, with clear feedback for each mode.
- Undo restores prior memberships and card position; returning after navigation does not repeat commands.

**Settle first.** Gesture mapping and whether album adds apply immediately; reconcile TDY-01 before implementation.

**Invariants:** INV-05, INV-14

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `web`; `rendered`

## PHO-06 HEIC RAW and companion-media support

`P2` · `M` · Spike · Backend, Web

Depends on: [PHO-01](#pho-01-decision-photo-identity-and-album-semantics)

**Why.** A photo library needs an honest plan for files produced by actual cameras and phones.

**Outcome.** Evaluate HEIC/HEIF previews, RAW+JPEG pairing, Live Photo still/video companions, burst identity, color profiles/HDR and orientation using redistributable synthetic fixtures. Recommend staged format support and processor packaging.

**Acceptance**

- Report read/preview/download support separately per format and browser; original bytes never change.
- Identify decoder licensing/redistribution questions for maintainer review, CPU/memory costs and graceful unsupported fallbacks.
- A companion file is not confused with a new version or a duplicate; no guessed pairing by basename alone.

**Settle first.** Priority camera formats and whether first support is metadata-only; follow accepted decision 0010 from PR #18; experiments requiring parsing or decoding use PRV-10's per-job sandbox.

**Invariants:** INV-03, INV-12, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `spike-notes`; bounded processor measurements

## PHO-07 Photo-library migration with sidecars and albums

`P2` · `L` · Build · Backend, Web · Public API change

Depends on: [IMP-01](bring-files-in.md#imp-01-import-an-existing-folder-from-the-server), [MET-04](metadata.md#met-04-portable-sidecar-import-and-metadata-export), [PHO-03](#pho-03-albums-api-and-collection-integrity)

**Why.** Adoption should preserve years of dates, captions and albums, not flatten them into an upload folder.

**Outcome.** Add a resumable import adapter for one selected export format, starting with a reviewed Google Takeout sample or ordinary files plus XMP. Preview mappings, report ambiguity and preserve import provenance; no account connector is required.

**Acceptance**

- Interrupted rerun adds neither duplicate files nor duplicate album memberships.
- Test renamed/truncated sidecar names, duplicate basenames across folders, missing companions, absent dates and conflicting timestamps.
- Source is read-only; a report accounts for every input as imported, skipped or needing attention.
- A round trip preserves digests and supported curation; unsupported source fields are explicitly listed.

**Settle first.** First export format/version and association rules; inspect current official export guidance at pickup.

**Invariants:** INV-02, INV-05, INV-10, INV-13, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; synthetic migration drill; `web`; `rendered`

## PHO-08 Similar-photo review without automatic deletion

`P3` · `M` · Spike · Backend, Web

Depends on: [ORG-10](organize.md#org-10-duplicate-finder), [PRV-02](previews-and-media.md#prv-02-image-thumbnail-pipeline)

**Why.** Exact digests do not identify ten almost-identical shots of one moment.

**Outcome.** Evaluate local perceptual similarity and burst-time grouping, keeping exact duplicates and similar photos visibly distinct. Produce a review prototype and measured recommendation for candidate grouping.

**Acceptance**

- Fixture set includes crops, edits, screenshots, different exposures and false-positive lookalikes; report errors.
- No automatic removal or storage deduplication; user chooses keeper and Tidy stages the rest.
- Measure index size and incremental cost; no cloud inference or AI subscription.

**Settle first.** Similarity threshold, opt-in processing and minimum useful accuracy before a build task is added.

**Invariants:** INV-01, INV-12, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `spike-notes`; rendered prototype inspection

## PHO-09 Read-only shared albums

`P3` · `M` · Build · Backend, Web · Public API change

Depends on: [PHO-04](#pho-04-fast-add-to-albums-and-album-browser), [ACC-04](access-and-sharing.md#acc-04-file-share-links), [MET-09](metadata.md#met-09-privacy-safe-media-downloads)

**Why.** An album is a natural way to share an event without exposing the containing folders.

**Outcome.** Add revocable album shares with cover, ordered media and safe downloads, using the existing share-grant infrastructure and explicit live-versus-snapshot semantics.

**Acceptance**

- Revocation and membership removal stop new access to originals and renditions; no sibling folders or other albums leak.
- Default media renditions omit private metadata; unchanged-original sharing requires the explicit ACC-03 choice.
- Expired, empty and unavailable media states work on phones without an account.

**Settle first.** Live or snapshot default and download permission; no collaborative uploads in this slice.

**Invariants:** INV-01, INV-11, INV-12

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `postgres`; `contract`; `web`; `rendered`

## PHO-10 Decision: private local people and semantic discovery

`P3` · `M` · Decision · Backend, Docs

Depends on: [PHO-02](#pho-02-photos-home-and-chronological-browsing), [MET-01](metadata.md#met-01-decision-metadata-authority-and-provenance)

**Why.** People and content search are valuable future photo features but introduce sensitive derived data and operating cost.

**Outcome.** Evaluate optional entirely local face grouping and semantic search as separate capabilities with explicit opt-in, model provenance, resource budgets and complete deletion/rebuild behavior. Recommend defer or one bounded prototype.

**Acceptance**

- Core photo browsing works with both disabled and without a model download.
- Define who may label people, visibility/export rules, correction of false matches and removal of embeddings/face crops.
- Compare usefulness and maintenance cost against metadata-only search on a synthetic or explicitly authorized dataset.

**Settle first.** Concrete demand and available hardware; no mandatory AI service and no automatic identity claims.

**Invariants:** INV-01, INV-11, INV-12, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `decision-review`

## PHO-11 Decision: automatic camera-library backup

`P2` · `M` · Decision · Clients, Backend, Docs

Depends on: [PHO-01](#pho-01-decision-photo-identity-and-album-semantics), [IOS-01](ios.md#ios-01-decision-native-auth-and-background-transfers)

**Why.** A first-class photo library should be able to receive new camera photos without repeated manual selection.

**Outcome.** Define opt-in camera-library ingestion, chosen albums, Wi-Fi/charging preferences, limited-library permission changes, duplicate identity and an honest background-progress model. Distinguish “uploaded to Filebonsai” from a tested retained backup; deleting on the phone must not silently delete the server copy.

**Acceptance**

- Walk through device reinstall, edited photo, cloud-only asset, revoked permission, limited photo access and a companion video.
- Define server acknowledgement and integrity requirements before marking an asset uploaded; never offer device deletion based only on enqueue success.
- Record platform background-execution limits and a foreground catch-up flow using current official guidance at pickup.
- Use the durable transfer dependency and whole-body retry until PAR-07 changes that guarantee.

**Settle first.** One-way ingestion versus deletion mirroring (recommend one-way), duplicate mapping across devices, and original versus edited-photo import.

**Invariants:** INV-03, INV-04, INV-06, INV-10, INV-14

**Read:** `docs/backlog/ios.md`, `docs/architecture/storage-and-transfers.md`, `docs/product/domain.md`

**Checks:** `decision-review`

## PHO-12 Opt-in camera upload and coverage status

`P3` · `L` · Build · iOS, Backend · Public API change

Depends on: [PHO-11](#pho-11-decision-automatic-camera-library-backup), [IOS-03](ios.md#ios-03-background-uploads), [IOS-05](ios.md#ios-05-photos-import-with-duplicate-skip)

Blocked on: Native iOS implementation remains deferred by user preference; this candidate does not lift that deferral.

**Why.** Camera upload should make missing and pending photos visible rather than promise uninterrupted background execution.

**Outcome.** Implement the accepted one-way camera ingestion flow, persisted asset-to-transfer mapping, foreground catch-up and a coverage screen with uploaded, waiting, unavailable and failed counts. Reuse manual photo import and transfer execution.

**Acceptance**

- Relaunch, permission narrowing, duplicate enumeration and account changes do not create duplicate committed uploads or expose another account's photos.
- A cloud-only or inaccessible asset reports that state without claiming it is backed up; retry preserves intent.
- Real-device suspended/relaunched tests record platform limitations; simulator success is not claimed as background-delivery proof.
- No automatic source deletion; mobile captions/dates/companions follow the accepted import policy.

**Settle first.** Device test availability, battery/network policy and maximum local staging budget; split observer, durable mapping and UI at pickup.

**Invariants:** INV-01, INV-04, INV-06, INV-09, INV-10, INV-14, INV-15

**Read:** `docs/backlog/ios.md`, `docs/backlog/photos.md`, `docs/development/testing.md`

**Checks:** native unit/integration tests; simulator inspection; authorized real-device suspend/relaunch drill
