# Everyday library

Make the daily loop of finding, looking and acting feel like the design direction: calm, dense and keyboard-first.

The running app is a single list with a create-folder form. The design reference shows a folder tree, grid and table views, an inspector, search, Starred and Recent. Each item here closes part of that gap without shipping mock-only controls.

See [the backlog index](README.md) for how to pick up and retire items.

The panel work below covers both entry details and the descriptive cards/help on
Storage and Settings. It builds on the existing inspector rather than creating a
second details surface. LIB-14 is reserved by the inspector-integrity split in
[PR #11](https://github.com/andwrobs/filebonsai/pull/11); new items start at LIB-15.

## LIB-01 Design tokens and shell foundation

`P1` · `M` · Build · Web

Depends on: none

**Why.** app.css hard-codes colors and mixes Georgia and Inter. The design direction needs one token set before more screens arrive.

**Outcome.** CSS custom-property tokens for color roles, spacing, radius, type scale and density; a licensed icon set; a text wordmark; existing screens migrated. Global tokens have a single writer.

**Acceptance**

- No raw hex values outside the token file
- AA contrast for text and action roles
- Icon license recorded

**Settle first**

- Icon family and license (Lucide under ISC is a good default)
- Keep the system serif or choose a licensed display face

**Read:** `docs/product/design.md`  
**Checks:** `web`; `rendered`

## LIB-02 Folder tree sidebar

`P2` · `M` · Build · Web, Backend · Public API change

Depends on: [LIB-01](#lib-01-design-tokens-and-shell-foundation)

**Why.** The design reference relies on a visible folder tree for orientation.

**Outcome.** A lazily loaded tree following the WAI-ARIA tree pattern that remembers expanded folders, reveals the current folder, and paginates large folders. listChildren gets a kind=FOLDER filter so the tree doesn't page through files.

**Acceptance**

- Arrow-key navigation per the ARIA tree pattern
- A parent with 1,000 folders stays responsive
- Collapses into a sheet on mobile

**Checks:** `contract`; `web`; `rendered`

## LIB-03 Server-side sort for folder listings

`P2` · `M` · Build · Backend · Public API change

Depends on: none

**Why.** listChildren orders by name only, while the table view needs sorting by modified date, size and kind.

**Outcome.** Sort options (name ascending and descending, modified, size, folders first) with opaque cursors scoped to the sort, as conventions.md already requires. Supporting indexes, with UUID as the tiebreak.

**Acceptance**

- Keyset pagination stays correct under concurrent inserts for every sort
- A cursor from one sort is rejected by another
- EXPLAIN shows index use at 10,000 children

**Read:** `docs/api/conventions.md`  
**Checks:** `postgres`; `contract`

## LIB-04 Table and grid views

`P2` · `M` · Build · Web

Depends on: [LIB-01](#lib-01-design-tokens-and-shell-foundation), [LIB-03](#lib-03-server-side-sort-for-folder-listings)

**Why.** The design reference shows a dense table and a calm grid over the same data.

**Outcome.** A table (name, kind, size, modified) with sortable headers backed by LIB-03, a grid with type icons (thumbnails later), and a view toggle remembered per viewer.

**Acceptance**

- Many-item, long-name and empty states
- Keyboard row navigation
- At 390px it falls back to the list layout

**Checks:** `web`; `rendered`

## LIB-05 Selection model

`P2` · `M` · Build · Web

Depends on: none

**Why.** Bulk move, trash and Tidy all need multi-select.

**Outcome.** Single, toggle (Cmd/Ctrl) and range (Shift) selection, select all on the page, focus kept separate from selection, long-press to start selecting on touch, and a toolbar with the selection count.

**Acceptance**

- ARIA multiselect semantics
- Selection survives loading more results
- Escape clears the selection

**Checks:** `web`; `rendered`

## LIB-06 Inspector panel

`P2` · `M` · Build · Web, Backend · Public API change

Depends on: [LIB-01](#lib-01-design-tokens-and-shell-foundation)

**Why.** The design reference shows details beside the list. File responses don't expose SHA-256 today.

**Outcome.** A collapsible inspector for the selected entry showing kind, size, created and modified dates, SHA-256 with a copy button, version count, storage connection display name and ID. On mobile it's a bottom sheet.

**Acceptance**

- The DTO adds only non-sensitive fields
- Tabs appear only once their features exist (no mock-only controls)
- Open state remembered per viewer

**Invariants:** INV-11  
**Checks:** `contract`; `web`; `rendered`

## LIB-07 Name search

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: [M1-02](finish-m1.md#m1-02-breadcrumbs-from-real-ancestors)

**Why.** Finding a file by name is the most basic feature still missing.

**Outcome.** Workspace-scoped name search using a pg_trgm index. Results show the ancestor path and exclude pending and trashed entries. A debounced search box with keyboard-navigable results.

**Acceptance**

- Recorded baseline: 50,000 entries answer in under 150 ms locally
- Ranking: exact, then prefix, then substring
- NFC handled; other workspaces invisible

**Settle first**

- Case- and accent-insensitive matching (lower + unaccent?)

**Invariants:** INV-01  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## LIB-08 Command palette and keyboard shortcuts

`P2` · `M` · Build · Web · Fun

Depends on: [LIB-01](#lib-01-design-tokens-and-shell-foundation)

**Why.** A keyboard-first file library should have Cmd+K.

**Outcome.** A palette for jumping to folders (recent and search) and running actions (new folder, upload, rename, move, Storage), plus a `?` shortcut sheet. Every action also has a button.

**Acceptance**

- Focus trapped while open and restored on close
- Shortcuts never fire inside text inputs
- Screen-reader labels on results

**Checks:** `web`; `rendered`

## LIB-09 Starred and Recent

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: none

**Why.** The sidebar shows disabled Recent and Archive entries.

**Outcome.** Starred is a per-principal pin (table plus API). Recent lists recently added or updated files, derived from versions. Both sidebar entries become real.

**Acceptance**

- Stars are principal-scoped and survive rename and move
- Recent excludes pending and trashed entries

**Invariants:** INV-01  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## LIB-10 Mobile layout pass

`P2` · `M` · Build · Web

Depends on: [LIB-01](#lib-01-design-tokens-and-shell-foundation)

**Why.** The mobile direction (A2/B2) uses bottom navigation and a one-handed list.

**Outcome.** Bottom navigation, a floating upload button, list rows with overflow menus, action sheets instead of hover menus, and safe-area handling.

**Acceptance**

- Rendered at 390×844 and 375×667
- No horizontal scroll; touch targets at least 44px
- The transfer tray stays reachable

**Checks:** `web`; `rendered`

## LIB-11 Large-folder performance

`P3` · `M` · Proof · Web, Backend

Depends on: [ENG-03](foundations.md#eng-03-synthetic-demo-library-generator)

**Why.** A self-hosted library will have folders with 10,000 or more files.

**Outcome.** Virtualized rendering and incremental cursor loading for huge folders, with backend page latency and web render time measured and recorded.

**Acceptance**

- Baselines recorded with the ENG-03 generator
- Scroll position and focus stay stable while loading

**Checks:** `web`; Recorded measurements

## LIB-12 Accessibility audit and fixes

`P2` · `M` · Build · Web

Depends on: [ENG-02](foundations.md#eng-02-playwright-end-to-end-harness)

**Why.** design.md sets a high accessibility bar, and nothing checks it automatically yet.

**Outcome.** axe checks in the e2e harness for each screen, a VoiceOver pass, and audits of focus restoration and reduced motion. Fix the findings and document the test matrix.

**Acceptance**

- Zero serious axe violations
- Findings and fixes listed in the handoff

**Checks:** `web`; e2e with axe

## LIB-13 Warm dark theme

`P3` · `S` · Build · Web · Fun

Depends on: [LIB-01](#lib-01-design-tokens-and-shell-foundation)

**Why.** Many people browse at night. The token work makes a dark theme cheap.

**Outcome.** A warm dark palette matched to the design direction, following prefers-color-scheme with a manual override.

**Acceptance**

- AA contrast for every role in both themes
- No raw colors
- Screenshots in both themes

**Settle first**

- Dark mode is separate from shell configurability (design.md): confirm it's wanted now

**Checks:** `web`; `rendered`

## LIB-15 Inspector hierarchy and description polish

`P2` · `M` · Build · Web

Depends on: [LIB-06](#lib-06-inspector-panel)

In flight: [PR #11](https://github.com/andwrobs/filebonsai/pull/11) separates the basic inspector from later integrity fields. Reconcile with that split when picking this up.

**Why.** A list of metadata is useful, but details should be easy to scan while browsing and comfortable to read on a phone.

**Outcome.** A composed inspector with a compact file identity header, a clearly grouped Details section, a primary open/download action, and progressive disclosure for technical fields. Notes use ORG-13 when implemented; previews use the preview epic. No placeholder editor, invented summary, or empty feature tabs.

**Acceptance**

- Typography, label/value alignment, spacing, dividers, icons, selection and focus use the shell tokens; important values remain readable without opening tooltips
- Long filenames wrap; IDs and available digests use selectable monospace text and accessible copy feedback; dates have an unambiguous full-date/time explanation
- No selection, folder, file, unavailable field, loading, removed/inaccessible entry and failure states are deliberate; changing focus never leaves another entry's details or actions visible
- Wide screens keep a useful list beside the inspector; narrower screens use a drawer/sheet with a reachable close action, bounded scrolling, safe-area padding and restored focus
- Panel width/open state have sensible defaults and reset; any local persistence is scoped to the viewer and hands off cleanly to CFG-04 later
- Keyboard browsing, 200% zoom, reduced motion, long localized text and a phone with the transfer tray open remain usable

**Read:** `docs/product/design.md`, `docs/development/principles.md`

**Checks:** `web`; `rendered` at desktop, tablet and phone widths

## LIB-16 Storage summary and explanatory panels

`P2` · `M` · Build · Web

Depends on: [LIB-01](#lib-01-design-tokens-and-shell-foundation)

**Why.** Storage currently mixes headline numbers, capability explanations and operator guidance with similar visual weight.

**Outcome.** Polish the existing Storage page into a concise connection summary, comparable usage/limit facts and expandable explanations. Establish reusable presentation patterns for description text, definition rows, status labels, help disclosure and action footers, adopted by Settings when it exists.

**Acceptance**

- Connection name/provider, committed usage and per-file upload limit have a clear reading order; supporting copy explains what a number means in one sentence
- Committed bytes are labeled as library usage, not a bill or bucket capacity; missing capacity never produces an invented percentage ring, progress bar or cost estimate
- Distinguish configured, last checked, checking, unavailable and failed only when the corresponding evidence exists; the current read-only summary never implies a live health check
- Keep task-relevant help near its control, with longer setup/security explanation behind disclosure; essential error recovery never relies on hover
- Loading skeletons preserve useful geometry; unknown values read as unknown, not zero; independent failures retain usable information and offer a focused retry
- Reflow long connection names and descriptions at 390px/200% zoom; status is never color-only; cards follow heading and definition-list semantics
- The future Add connection flow belongs to TIER-13; do not show a working-looking setup button before that capability exists

**Invariants:** INV-11, INV-14

**Checks:** `web`; `rendered`

## LIB-17 Panel interaction and feedback polish

`P2` · `M` · Build · Web

Depends on: [LIB-15](#lib-15-inspector-hierarchy-and-description-polish), [LIB-16](#lib-16-storage-summary-and-explanatory-panels)

**Why.** Opening a sheet, copying a value, saving a setting and recovering from failure should feel like the same application.

**Outcome.** Consistent panel headers, close/back behavior, inline validation, busy controls, copy/save feedback and restrained open/close transitions across implemented details and settings surfaces.

**Acceptance**

- Hover, keyboard focus, selected, disabled, pending, success and failure are visually distinct using existing tokens; reserve layout space for validation where practical
- Dialog/sheet focus is contained and restored; an inline inspector does not trap focus; Escape follows one documented overlay order without dismissing unrelated transfers
- Saving prevents duplicate actions and announces its actual result; a failed save retains non-secret edits and gives a retry path; unsaved changes are handled explicitly
- Reduced motion removes spatial transitions; screen readers receive short useful status messages; no repeated announcements while polling
- Back navigation, virtual keyboard and simultaneous inspector/transfer tray use do not obscure the active control or discard a transfer

**Checks:** `web`; `rendered`; keyboard and screen-reader inspection

## LIB-18 Panel visual regression coverage

`P2` · `M` · Proof · Web

Depends on: [ENG-02](foundations.md#eng-02-playwright-end-to-end-harness), [LIB-15](#lib-15-inspector-hierarchy-and-description-polish), [LIB-16](#lib-16-storage-summary-and-explanatory-panels)

**Why.** A polished happy-path screenshot does not protect long descriptions, narrow screens or failure recovery.

**Outcome.** A small deterministic visual/state matrix for the inspector and Storage, extended by each Settings/onboarding slice when it ships. Capture representative combinations, not every permutation.

**Acceptance**

- Cover 1440×900, a tablet breakpoint and 390×844; include long names, missing metadata, many rows, loading, failure and a busy transfer tray
- Pin browser/fonts/time/fixtures and animation handling; fixtures are visibly synthetic and contain no credentials, signed URLs, internal paths or real provider details
- Include 200% zoom, keyboard focus, reduced motion and touch targets; dark-theme coverage starts when LIB-13 ships
- Render against the PostgreSQL-profile backend; distinguish injected failure fixtures from observed backend behavior; inspect diffs rather than automatically accepting new baselines

**Checks:** `web`; `rendered`; visual snapshots and accessibility evidence
