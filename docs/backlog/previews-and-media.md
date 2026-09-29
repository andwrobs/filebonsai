# Previews & media

See a file before downloading it. Derived assets inherit authorization and never block the original.

Image thumbnails come first, as storage-and-transfers.md says, and they need a sandboxed processor plus durable jobs. Once thumbnails exist, the gallery, lightbox, Tidy cards and 'On this day' all benefit.

See [the backlog index](README.md) for how to pick up and retire items.

## PRV-02 Image thumbnail pipeline

`P2` · `L` · Build · Backend · Public API change

Depends on: [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer), [PRV-10](#prv-10-processing-sandbox-container)

**Why.** Thumbnails transform browsing, Tidy cards and the gallery.

**Outcome.** When a version becomes AVAILABLE, the outbox queues a job that writes derived assets (bound to the version and stamped with the processor version) and serves them from an authorized thumbnail endpoint. Failures are recorded and never affect the original. A processor-version bump triggers regeneration.

**Acceptance**

- A decode bomb is rejected within budget
- Other workspaces get 404
- The original download is unaffected by preview failure (test)

**Invariants:** INV-12, INV-15  
**Checks:** `postgres`; `contract`

## PRV-03 Gallery grid and lightbox

`P2` · `M` · Build · Web · Fun

Depends on: [PRV-02](#prv-02-image-thumbnail-pipeline), [LIB-04](everyday-library.md#lib-04-table-and-grid-views)

**Why.** This is the Quiet Library direction: big, calm thumbnails.

**Outcome.** A thumbnail grid and a lightbox with arrow keys, swipe, zoom, neighbour prefetch and download. Non-images get type icons, and images load lazily.

**Acceptance**

- Lightbox traps and restores focus
- Swipe has button equivalents
- Reduced-motion variant

**Checks:** `web`; `rendered`

## PRV-04 Photo metadata extraction

`P2` · `L` · Build · Backend, Web · Public API change

Depends on: [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer), [PRV-10](#prv-10-processing-sandbox-container)

Context: LIB-03 (merged in PR #17) owns the sort parameter that 'Taken' joins. Accepted decisions 0009 and 0010 from PR #18 define jobs, processing isolation and the extracted field set. Split at pickup: extraction and storage first, then the API, inspector and sort.

**Boundary.** This item owns the first extraction pipeline. [MET-01](metadata.md#met-01-decision-metadata-authority-and-provenance)/[MET-02](metadata.md#met-02-revisioned-annotations-and-effective-metadata-api) extend it with provenance and user corrections; they reuse this result rather than create a second extractor. Both parser tiers require PRV-10's per-job sandbox under accepted decision 0010.

**Why.** Capture dates and dimensions drive sorting, 'On this day' and Tidy. The user asked on 2026-09-27 for files to capture and show more metadata.

**Outcome.** Decision 0010's Tier A sandboxed child process extracts its allow-listed field set: dimensions, orientation, taken time, camera, lens, exposure settings, authorship and GPS. Location goes in a separate private table. Publication enqueues extraction, and a sweeper backfills existing versions and re-runs older extractor versions. The inspector shows the fields and 'Taken' becomes a sort option.

**Acceptance**

- Private GPS fields are absent from ordinary listings and shares/exports without explicit opt-in. Unchanged originals may contain GPS; [MET-09](metadata.md#met-09-privacy-safe-media-downloads) owns sanitized media delivery
- Malformed fields have bounded outcomes and do not affect original availability; extractor version and outcome distinguish absent, unsupported and failed processing
- Tier A evidence from decision 0010: malformed fixtures, a killed over-budget child, heap and output caps, an empty child environment, network denial and per-job filesystem isolation
- Other workspaces get 404 for metadata

**Checks:** `postgres`; `contract`; `web`

## PRV-05 Text, Markdown and PDF previews

`P3` · `M` · Build · Backend, Web

Depends on: [PRV-10](#prv-10-processing-sandbox-container)

**Why.** Documents are most of a library after photos.

**Outcome.** Text and Markdown render as escaped text or sanitized Markdown (no raw HTML, no remote images) with a size cap. PDFs get a first-page thumbnail from the sandboxed processor. HTML and SVG are never served inline.

**Acceptance**

- Sanitizer tests with hostile Markdown
- Preview size caps enforced

**Checks:** `backend`; `web`; `rendered`

## PRV-06 Video posters and range downloads

`P3` · `L` · Build · Backend, Web · Public API change

Depends on: [PRV-02](#prv-02-image-thumbnail-pipeline)

**Why.** Video needs poster frames and byte ranges; conventions.md says M1 doesn't promise ranges.

**Outcome.** Poster-frame extraction with a sandboxed ffmpeg, and HTTP Range support for originals so video can stream in the browser.

**Acceptance**

- Range semantics decided for local and R2
- Unauthorized range requests return 404

**Checks:** `backend`; `contract`; `web`

## PRV-07 On this day

`P3` · `S` · Build · Web · Fun

Depends on: [PRV-04](#prv-04-photo-metadata-extraction), [PRV-03](#prv-03-gallery-grid-and-lightbox)

**Why.** A gentle reason to open your library.

**Outcome.** A home card that brings back photos taken on this date in earlier years. Opt-in and calm.

**Acceptance**

- Hidden when there's nothing to show
- Dismissible per day

**Checks:** `web`; `rendered`

## PRV-08 Spike: map of geotagged photos

`P2` · `M` · Spike · Web · Fun

Depends on: [PRV-04](#prv-04-photo-metadata-extraction)

**Why.** Photos on a map are delightful, but tile sources and GPS privacy need thought.

**Outcome.** Evaluate a map view, including a zoomed-out heat layer, using a self-hostable or operator-configured tile source. Review GPS privacy and server-side location binning, and recommend yes or no. [RFL-05](reflect.md#rfl-05-photo-map-with-heat-layer) builds on the recommendation.

**Acceptance**

- Tile-provider attribution, cache/offline limits, budget and outbound-request privacy recorded; consult [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) (checked 2026-09-28). Public OSM tiles are not an unrestricted offline tile service
- Compare self-hosted and operator-selected tile/geocoding sources; enabling a map explains that tile requests reveal viewed areas and client/network metadata
- Evaluate bounded viewport queries and indexes on 100,000 synthetic locations, including antimeridian and polar bounds
- Clear recommendation

**Checks:** `spike-notes`

## PRV-10 Processing sandbox container

`P2` · `L` · Build · Backend, Infra

Depends on: none

**Why.** A parser compromise must not reach backend secrets, originals or another job. Decision 0010 requires a per-job sandbox for both metadata parsing and native decoding.

**Outcome.** A processor image built with the release, and a Compose service with no network, a read-only root, capped scratch, memory, CPU and PID limits, and no capabilities. Each job has a separate sandbox with private read-only input and bounded output mounts, with deadlines on both sides; no job can mount the shared spool root. The backend gets a client through a restricted trusted launcher. Tier A runs its child JVM inside this boundary. libvips runs with untrusted operations blocked and only allow-listed loaders enabled. The first operation is a header probe (format and dimensions) for PRV-02's pixel cap. Without the sandbox, both tiers report that they are unavailable.

**Acceptance**

- From inside the sandbox, a network connection fails, and backend secret files and storage are unreadable
- A MAT, SVG or PDF body named `.jpg` is refused
- A decode bomb and a hung job stop within budget, and the backend stays responsive
- Concurrent jobs cannot read or modify each other's inputs or outputs
- The backend reaps the sandbox before reading output; links, special files, unexpected paths, and oversized or malformed output are rejected through pinned descriptors

**Invariants:** INV-11, INV-15  
**Read:** `docs/decisions/0010-media-processing-isolation.md`  
**Checks:** `backend`; sandbox checks through the local Compose stack
