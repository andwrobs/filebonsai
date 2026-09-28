# Reflect

Beautiful views of the files that matter most: a zoomable timeline, a map, and quick ways to pick favourites and prune the rest. They are for looking back and thinking things through.

A library holds years of a life, but folders and tables only show it one directory at a time. These views arrange the same files by when and where. They bring the best forward, and they make choosing and letting go feel light. They follow the rules the rest of the product follows. A view is a way of looking at the library: it never changes permissions, the owner's choices always win over automatic picks, and archive or trash still goes through Tidy's review. Location stays private to the owner, and nothing needs an AI service at runtime. [PRV-07](previews-and-media.md#prv-07-on-this-day) On this day belongs to the same family, and RFL-04 extends [Tidy mode](tidy-mode.md).

See [the backlog index](README.md) for how to pick up and retire items.

## RFL-01 Decision: reflective views and picks

`P2` · `M` · Decision · Web, Backend, Docs · Fun

Depends on: none

**Why.** The timeline, the map and the pick tools share one idea. They should also share one model for what "important" means, how files group together, and how the owner's choices override automatic ones.

**Outcome.** A decision record plus a lo-fi prototype page over a synthetic library. It defines:

- Picks: a per-principal curation state (picked, or hidden from views), and how it relates to Starred ([LIB-09](everyday-library.md#lib-09-starred-and-recent))
- Automatic picks: deterministic, explainable rules that need no AI or external service. Examples: starred first, spread across a cluster, skip exact duplicates and screenshots, prefer recently opened files ([TDY-03](tidy-mode.md#tdy-03-access-recency-signal)). Each pick carries a short reason.
- Clusters: groups formed from gaps in capture time and from place, stable across reloads
- Rendering: canvas or DOM, zoom levels, thumbnail loading, and the accessible equivalent that isn't a canvas
- Privacy: location is visible only in the owner's own views

**Acceptance**

- An owner's pick or hide always overrides an automatic pick, and the two look different
- Every view has a keyboard and screen-reader equivalent
- Automatic picks are deterministic for an unchanged library, and each one can say why it was chosen
- No runtime AI, LLM or third-party service is required

**Settle first**

- Picks as their own state, or Starred plus a "hide from views" flag
- Photos only at first, or any file with a meaningful date
- Generated views only, or can people also compose their own boards (a hand-arranged canvas of chosen files)

**Read:** `docs/product/overview.md`, `docs/product/design.md`, `docs/backlog/tidy-mode.md`  
**Checks:** `decision-review`

## RFL-02 Timeline clusters and picks API

`P3` · `L` · Build · Backend · Public API change

Depends on: [RFL-01](#rfl-01-decision-reflective-views-and-picks), [PRV-04](previews-and-media.md#prv-04-photo-metadata-extraction)

**Boundary.** Reuse [PHO-02](photos.md#pho-02-photos-home-and-chronological-browsing) chronological queries when available; this item adds zoom-level clustering and picks, not a second basic photo timeline.

**Why.** The canvas needs grouped data at each zoom level. Sending every file to the browser doesn't scale.

**Outcome.** Timeline endpoints return buckets for a requested zoom level (years, months or days). Each bucket has counts, cluster boundaries and cover picks, and each pick is marked automatic or chosen. A curation endpoint picks, unpicks or hides an entry. Clusters are computed on read or kept up to date by a job, as RFL-01 decides.

**Acceptance**

- Excludes pending and trashed entries; archived entries as RFL-01 decides
- Chosen picks always win, and automatic picks are stable for an unchanged library
- Cursor-paginated and workspace-scoped; other workspaces get 404

**Invariants:** INV-01, INV-12  
**Checks:** `postgres`; `contract`

## RFL-03 Timeline canvas

`P3` · `L` · Build · Web · Fun

Depends on: [RFL-02](#rfl-02-timeline-clusters-and-picks-api), [PRV-02](previews-and-media.md#prv-02-image-thumbnail-pipeline), [PRV-03](previews-and-media.md#prv-03-gallery-grid-and-lightbox), [ENG-03](foundations.md#eng-03-synthetic-demo-library-generator)

**Why.** This is the centrepiece: years of files laid out in time, calm enough to wander through.

**Outcome.** A canvas you can pan and zoom, from years down to a single day. Each cluster shows its cover picks and a count. Zooming in opens a cluster to show more pictures, and zooming out folds them back. Chosen and automatic picks look different, and you can pick or hide a file in place. Opening a picture uses the lightbox (PRV-03).

**Acceptance**

- Pan and zoom by keyboard, buttons, pinch and wheel; an accessible list view mirrors the canvas
- Stays smooth on a large synthetic library (ENG-03), with a recorded frame-time baseline
- Works one-handed at 390px; the reduced-motion variant has no animated zoom

**Checks:** `web`; `rendered`

## RFL-04 Pick and prune a group

`P3` · `M` · Build · Web, Backend · Public API change · Fun

Depends on: [RFL-03](#rfl-03-timeline-canvas), [TDY-06](tidy-mode.md#tdy-06-swipe-deck-ui)

**Why.** Choosing favourites and letting go of the rest should feel as light as flicking through a stack of prints.

**Outcome.** A timeline cluster, a folder or a selection opens as a swipe deck scoped to that group. Map areas join once RFL-05 exists. A new Pick deck is about highlights: → pick, ← pass. The usual archive and trash actions are one key or button away. A grid mode lets you tap many files at once for the same result. Picks apply immediately and can be undone. Archive and trash are staged for Tidy's review ([TDY-05](tidy-mode.md#tdy-05-tidy-decision-batches)).

**Acceptance**

- The deck holds exactly the group's eligible files
- Every swipe has a key and button equivalent
- Nothing is archived or trashed without batch review, and picks appear on the timeline straight away

**Invariants:** INV-01  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## RFL-05 Photo map with heat layer

`P2` · `L` · Build · Backend, Web · Public API change · Fun

Depends on: [PRV-08](previews-and-media.md#prv-08-spike-map-of-geotagged-photos), [RFL-01](#rfl-01-decision-reflective-views-and-picks), [PRV-02](previews-and-media.md#prv-02-image-thumbnail-pipeline), [PRV-03](previews-and-media.md#prv-03-gallery-grid-and-lightbox)

**Why.** Where a photo was taken can bring back as much as when.

**Outcome.** A map of geotagged files. Zoomed out, a heat layer shows where photos are concentrated. Zooming in turns the heat into clusters with cover picks, then into individual thumbnails. The server bins locations for the requested viewport and zoom, so the browser receives counts per cell instead of every coordinate. Selecting an area opens a paginated photo list; RFL-04 group curation and the reflective timeline are progressive enhancements once implemented. The basic map does not wait for the canvas. It uses the tile source that PRV-08 recommends.

**Acceptance**

- Photo coordinates are scoped to authorized private views; shared API payloads omit them. [MET-09](metadata.md#met-09-privacy-safe-media-downloads) covers embedded metadata in media downloads; configured tile requests follow PRV-08 disclosure
- Viewport bounds, antimeridian wrapping, zoom limits, filter-scoped counts and bounded cluster responses have PostgreSQL tests; tiles never receive individual photo coordinates or filenames
- Missing/invalid GPS is visible in an Unlocated group; range checks do not invent a location
- A selected cluster supports lightbox and album actions when available; repeated pan/zoom cancels stale results
- With no tile source configured there is no map and no outbound map request
- A list of places mirrors the map for keyboard and screen-reader use
- Other workspaces get 404

**Invariants:** INV-01  
**Checks:** `postgres`; `contract`; `web`; `rendered`
