# Everyday library

Make the daily loop of finding, looking and acting feel like the design direction: calm, dense and keyboard-first.

The running app has a responsive shell (sidebar, icon rail, or bottom navigation), a dense folder list and a create-folder form. The design reference shows a folder tree, grid and table views, an inspector, search, Starred and Recent. Each item here closes part of that gap without shipping mock-only controls.

See [the backlog index](README.md) for how to pick up and retire items.

The panel work below covers both entry details and the descriptive cards/help on
Storage and Settings. It builds on the existing inspector rather than creating a
second details surface.

## LIB-02 Folder tree sidebar

`P2` · `M` · Build · Web, Backend · Public API change

Depends on: none

Context: LIB-01/LIB-10 added the responsive shell: tokens in `web/src/styles/tokens.css` (raw colors outside the token files fail `tokens.test.ts`), Lucide icons, and the `web/src/routes/app-shell` layout route with sidebar, icon rail and bottom navigation. The tree goes in the sidebar's existing navigation; the rail and phone layouts need the sheet this item describes.

**Why.** The design reference relies on a visible folder tree for orientation.

**Outcome.** A lazily loaded tree following the WAI-ARIA tree pattern that remembers expanded folders, reveals the current folder, and paginates large folders. listChildren gets a kind=FOLDER filter so the tree doesn't page through files.

**Acceptance**

- Arrow-key navigation per the ARIA tree pattern
- A parent with 1,000 folders stays responsive
- Collapses into a sheet on mobile

**Checks:** `contract`; `web`; `rendered`

## LIB-04 Table and grid views

`P2` · `M` · Build · Web

Depends on: none

Context: LIB-03 added `sort` (`name`, `updatedAt`, `size`), `order` (`asc`, `desc`) and `foldersFirst` to `listChildren`. Each cursor is bound to all three, so changing a header must restart paging from the first page. Kind is not a server sort: the column's label comes from the filename extension, so a Kind header can map to `foldersFirst` or stay unsortable. LIB-01/LIB-10 added the responsive shell: tokens in `web/src/styles/tokens.css` (raw colors outside the token files fail `tokens.test.ts`), Lucide icons, and the `web/src/routes/app-shell` layout route with sidebar, icon rail and bottom navigation. The folder list already has icon, name, kind, size and modified columns that drop and stack through container queries; this item adds sortable headers and the grid.

**Why.** The design reference shows a dense table and a calm grid over the same data.

**Outcome.** A table (name, kind, size, modified) with sortable headers backed by the server-side sort, a grid with type icons (thumbnails later), and a view toggle remembered per viewer.

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

Depends on: none

Context: LIB-01/LIB-10 added the responsive shell: tokens in `web/src/styles/tokens.css` (raw colors outside the token files fail `tokens.test.ts`), Lucide icons, and the `web/src/routes/app-shell` layout route with sidebar, icon rail and bottom navigation.

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

**Why.** The design reference's sidebar has Starred and Recent, and the app has neither.

**Outcome.** Starred is a per-principal pin (table plus API). Recent lists recently added or updated files, derived from versions. Both sidebar entries become real.

**Acceptance**

- Stars are principal-scoped and survive rename and move
- Recent excludes pending and trashed entries

**Invariants:** INV-01  
**Checks:** `postgres`; `contract`; `web`; `rendered`

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

Depends on: none

Context: LIB-01/LIB-10 added the responsive shell: tokens in `web/src/styles/tokens.css` (raw colors outside the token files fail `tokens.test.ts`), Lucide icons, and the `web/src/routes/app-shell` layout route with sidebar, icon rail and bottom navigation. Add the dark palette as a second set of the same tokens; `tokens.test.ts` checks contrast for the light set and should cover both.

**Why.** Many people browse at night. The token work makes a dark theme cheap.

**Outcome.** A warm dark palette matched to the design direction, following prefers-color-scheme with a manual override.

**Acceptance**

- AA contrast for every role in both themes
- No raw colors
- Screenshots in both themes

**Settle first**

- Dark mode is separate from shell configurability (design.md): confirm it's wanted now

**Checks:** `web`; `rendered`

## LIB-14 Inspector integrity fields

`P2` · `S` · Build · Backend, Web · Public API change

Depends on: none

Context: LIB-06 added the inspector, now in `web/src/routes/library/components/Inspector/`. It is a docked column from 1100px, a modal drawer below that and a bottom sheet on phones. Each row's Details button or the toolbar toggle opens it, and it shows the current folder when nothing is chosen. The Details list has size, dates and the ID; there are no tabs yet. Add the new fields to that list.

**Why.** File responses don't expose the SHA-256, version count or storage connection, which are what make a file's details trustworthy.

**Outcome.** The file DTO adds the current version's SHA-256, the version count and the storage connection display name. The inspector shows them, with a copy button for the digest.

**Acceptance**

- The DTO adds only non-sensitive fields: no object keys, paths, bucket names or provider IDs
- Generated TypeScript and Swift clients decode the new fields

**Invariants:** INV-11  
**Checks:** `contract`; `web`; `rendered`

## LIB-15 Inspector hierarchy and description polish

`P2` · `M` · Build · Web

Depends on: none

Context: LIB-06 added the inspector, now in `web/src/routes/library/components/Inspector/`. It is a docked column from 1100px, a modal drawer below that and a bottom sheet on phones. Each row's Details button or the toolbar toggle opens it, and it shows the current folder when nothing is chosen. The Details list has size, dates and the ID; there are no tabs yet.

Integrity fields (SHA-256, version count, storage connection) come from [LIB-14](#lib-14-inspector-integrity-fields); place them in the technical disclosure once it ships.

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

Depends on: none

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
