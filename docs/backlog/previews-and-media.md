# Previews & media

See a file before downloading it. Derived assets inherit authorization and never block the original.

Image thumbnails come first, as storage-and-transfers.md says, and they need a sandboxed processor plus durable jobs. Once thumbnails exist, the gallery, lightbox, Tidy cards and 'On this day' all benefit.

See [the backlog index](README.md) for how to pick up and retire items.

## PRV-01 Decision: preview processing sandbox

`P2` · `S` · Decision · Backend

Depends on: none

In flight: `claude/media-metadata-decisions` proposes [decision 0010](../decisions/0010-media-processing-isolation.md) for review. It also covers the metadata extraction PRV-04 needs. On acceptance, that branch deletes this item.

**Why.** Image decoders are an attack surface, and storage-and-transfers.md requires bounded processing.

**Outcome.** A decision covering the processor (a libvips subprocess vs ImageIO or TwelveMonkeys), process isolation (CPU, memory, time, no network), pixel-count limits against decode bombs, supported formats, outputs (WebP at 256 and 1024), where derived assets live, authorized serving and caching, EXIF orientation and stripping, and processor-version stamping.

**Acceptance**

- Threat model included
- First formats named, with rationale

**Invariants:** INV-12, INV-15  
**Read:** `docs/architecture/storage-and-transfers.md`  
**Checks:** `decision-review`

## PRV-02 Image thumbnail pipeline

`P2` · `L` · Build · Backend · Public API change

Depends on: [PRV-01](#prv-01-decision-preview-processing-sandbox), [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer), [PRV-10](#prv-10-processing-sandbox-container)

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

Depends on: [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer), [PRV-01](#prv-01-decision-preview-processing-sandbox)

Context: LIB-03 (in flight on `claude/server-side-sort`) owns the sort parameter that 'Taken' joins. Split at pickup: extraction and storage first, then the API, inspector and sort.

**Why.** Capture dates and dimensions drive sorting, 'On this day' and Tidy. The user asked on 2026-09-27 for files to capture and show more metadata.

**Outcome.** Decision 0010's Tier A child process extracts its allow-listed field set: dimensions, orientation, taken time, camera, lens, exposure settings, authorship and GPS. Location goes in a separate private table. Publication enqueues extraction, and a sweeper backfills existing versions and re-runs older extractor versions. The inspector shows the fields and 'Taken' becomes a sort option.

**Acceptance**

- GPS is absent from listings and never included in shares or exports without explicit opt-in
- Malformed metadata never fails the job hard; each version records one outcome
- Tier A evidence from decision 0010: malformed fixtures, a killed over-budget child, heap and output caps, an empty child environment
- Other workspaces get 404 for metadata

**Checks:** `postgres`; `contract`; `web`

## PRV-05 Text, Markdown and PDF previews

`P3` · `M` · Build · Backend, Web

Depends on: [PRV-01](#prv-01-decision-preview-processing-sandbox), [PRV-10](#prv-10-processing-sandbox-container)

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

`P3` · `S` · Spike · Web · Fun

Depends on: [PRV-04](#prv-04-photo-metadata-extraction)

**Why.** Photos on a map are delightful, but tile sources and GPS privacy need thought.

**Outcome.** Evaluate a map view, including a zoomed-out heat layer, using a self-hostable or operator-configured tile source. Review GPS privacy and server-side location binning, and recommend yes or no. [RFL-05](reflect.md#rfl-05-photo-map-with-heat-layer) builds on the recommendation.

**Acceptance**

- Tile-provider terms and privacy recorded
- Clear recommendation

**Checks:** `spike-notes`

## PRV-10 Processing sandbox container

`P2` · `L` · Build · Backend, Infra

Depends on: [PRV-01](#prv-01-decision-preview-processing-sandbox)

**Why.** Native decoders are the riskiest code Filebonsai would run. Decision 0010 confines them to a container with no network or secrets that sees only the job's input.

**Outcome.** A processor image built with the release, and a Compose service with no network, a read-only root, capped scratch, memory, CPU and PID limits, and no capabilities. Work is exchanged through a spool volume, with deadlines on both sides, and the backend gets a client. libvips runs with untrusted operations blocked and only allow-listed loaders enabled. The first operation is a header probe (format and dimensions) for PRV-02's pixel cap. Without the container, Tier B reports that it is unavailable.

**Acceptance**

- From inside the sandbox, a network connection fails, and backend secret files and storage are unreadable
- A MAT, SVG or PDF body named `.jpg` is refused
- A decode bomb and a hung job stop within budget, and the backend stays responsive
- The backend rejects oversized or malformed processor output

**Invariants:** INV-11, INV-15  
**Read:** `docs/decisions/0010-media-processing-isolation.md`  
**Checks:** `backend`; sandbox checks through the local Compose stack
