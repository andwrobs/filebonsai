# Everyday library

Make the daily loop of finding, looking and acting feel like the design direction: calm, dense and keyboard-first.

The running app has a responsive shell (sidebar, icon rail, or bottom navigation), a dense folder list and a create-folder form. The design reference shows a folder tree, grid and table views, an inspector, search, Starred and Recent. Each item here closes part of that gap without shipping mock-only controls.

See [the backlog index](README.md) for how to pick up and retire items.

The panel work below covers both entry details and the descriptive cards/help on
Storage and Settings. It builds on the existing inspector rather than creating a
second details surface.

Decision [0011](../decisions/0011-web-client-follows-the-spa-template.md)
moves screens onto `web/src/lib/ui` and `web/src/styles/index.css`. The shell,
sign-in, not-found page, and Library list are there. LIB-15 and LIB-16 move the
inspector and Storage as part of their redesigns, so neither is restyled twice.

## LIB-07 Name search

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: none

Context: M1-02 added `ancestors` (root-to-parent `id` and `name`) to folders read through `getEntry`; listing rows do not carry it. Search results that show a location can reuse that query or the web `FolderBreadcrumbs` component.

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

Context: LIB-01/LIB-10 added the responsive shell: tokens in `web/src/styles/index.css` (raw colors anywhere else fail `tokens.test.ts`), Lucide icons, and the `web/src/routes/app-shell` layout route with sidebar, icon rail and bottom navigation.

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

Context: LIB-01/LIB-10 added the responsive shell, Lucide icons, and the `web/src/routes/app-shell` layout route with sidebar, icon rail and bottom navigation. The tokens live in `web/src/styles/index.css`, whose starter `.dark` block and `dark` variant are the place for the dark palette; `tokens.test.ts` checks contrast for the light set and should cover both.

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

Depends on: none

Context: LIB-06 added the inspector, now in `web/src/routes/library/components/Inspector/`. It is a docked column from 1100px, a modal drawer below that and a bottom sheet on phones. Each row's Details button or the toolbar toggle opens it, and it shows the current folder when nothing is chosen. The Details list has size, dates, version count, storage connection, SHA-256 (with a copy button, or "Not recorded") and the ID; there are no tabs yet. Place the integrity fields (versions, storage connection, SHA-256) in the technical disclosure.

**Why.** A list of metadata is useful, but details should be easy to scan while browsing and comfortable to read on a phone.

**Outcome.** A composed inspector with a compact file identity header, a clearly grouped Details section, a primary open/download action, and progressive disclosure for technical fields. Notes use ORG-13 when implemented; previews use the preview epic. No placeholder editor, invented summary, or empty feature tabs.

**Acceptance**

- Typography, label/value alignment, spacing, dividers, icons, selection and focus use the shell tokens; important values remain readable without opening tooltips
- Long filenames wrap; IDs and available digests use selectable monospace text and accessible copy feedback; dates have an unambiguous full-date/time explanation
- No selection, folder, file, unavailable field, loading, removed/inaccessible entry and failure states are deliberate; changing focus never leaves another entry's details or actions visible
- Wide screens keep a useful list beside the inspector; narrower screens use a drawer/sheet with a reachable close action, bounded scrolling, safe-area padding and restored focus
- Panel width/open state have sensible defaults and reset; any local persistence is scoped to the viewer and hands off cleanly to CFG-04 later
- Keyboard browsing, 200% zoom, reduced motion, long localized text and a phone with the transfer tray open remain usable

- The inspector (docked column, drawer and sheet) is built from `lib/ui` components and Tailwind utilities, and its rules leave `app.css`

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
- The Storage page is built from `lib/ui` components and Tailwind utilities, and its rules leave `app.css`

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

## LIB-22 Entry actions: context menu and in-app drag

`P2` · `L` · Build · Web

Depends on: [M1-11](finish-m1.md#m1-11-drag-and-drop-upload), [ORG-02](organize.md#org-02-rename), [ORG-03](organize.md#org-03-move)

Context: LIB-05 added the listing selection (`useEntrySelection`, owned by the Library route and shown by the inspector); its `target(entryId)` and the pure `entryTarget` rule in `web/src/routes/library/entry-selection.ts` already implement right-click targeting. `web/src/lib/ui` already has `context-menu`, `dropdown-menu` and `command` components. ORG-02 adds an overflow menu for touch rows, ORG-03 the move API and 'Move to…' dialog, and LIB-08 the command palette. Without one action list, each of these grows its own menu.

**Why.** People expect to right-click a file or folder, drag entries between folders, and act on folders from the tree, as they do in Finder, Explorer, Drive and Dropbox.

**Outcome.** One list of implemented entry actions, shared by the context menu, touch overflow, inspector and command palette when present. Actions declare their label, icon, shortcut, selection scope and availability. Right-click, Menu or Shift+F10 on a table row, grid tile or tree node opens the correctly scoped menu under LIB-05; background menus target the current folder. Offer Open, Rename, Move to…, New folder here, Upload here, Download and Details where supported; add Trash, Star and Tags only when they ship.

One shell-scoped catalog drag owner connects table/grid sources with folder rows/tiles, left-sidebar tree nodes and folder breadcrumbs, including the Library root. Files can move into folders and folders into folders without navigating first. Selection stays owned by the listing; a drag snapshots its source entry IDs and workspace for the shared owner. Hovering a collapsed tree folder expands it without opening its route. External computer-file drops use M1-11's upload path. Tree menus also support creating a child folder and renaming the targeted folder. Split shared actions/menu work and cross-panel dragging into bounded slices at pickup; do not require the command palette to ship first.

**Acceptance**

- Every menu and drag action has a keyboard and touch path through overflow/actions and ORG-03's Move to… dialog; single-item and mixed file/folder selections expose only applicable implemented actions
- Menus follow the WAI-ARIA pattern, stay within the viewport near its edges and do not steal a grid's ordinary click/double-click gestures. Escape restores entry focus; navigation or a removed target closes the menu before an action can run against a stale scope
- Dragging a selected entry carries the selection; dragging an unselected entry carries only it. The preview shows the item count and destination feedback names the folder, with an affordance beyond color
- Prove file → grid folder, folder → grid folder, selected files/folders → sidebar folder, and entry → breadcrumb/root in the real backend journey; the same move command and result handling serve every target
- Invalid targets (a file, the entry itself, its descendant, its current parent or another workspace) cannot issue a move. The server independently enforces scope/cycles; unavailable ancestry is fetched or the target stays pending, never guessed safe
- Hover expansion and scrolling work in the virtualized tree; recycling/unmounting a row cannot change the destination ID. Leaving a target cancels pending hover expansion; hovering does not navigate or lose the drag
- Each accepted drop issues one move operation. Pending, success, name conflict, stale revision, permission loss and uncertain completion have explicit feedback following ORG-01; retain failed entries for retry, remove confirmed successes from source selection, and refresh affected listings/tree/inspector ancestry
- Escape, an outside drop, workspace/session change and teardown cancel an unsubmitted drag without a mutation. Clear drag feedback after completion/cancellation; external files/text cannot impersonate trusted in-app entry IDs
- An action the viewer can't perform is hidden or disabled with a reason. UI affordances do not replace server authorization; a permission change while the menu/drag is open is handled safely

**Settle first**

- Whether hidden or disabled is the default for unavailable actions
- Prefer the existing React Aria collection drag/drop hooks where they support cross-collection targets; validate grid/tree interoperability and virtualization before choosing a different library or native events
- Hover delay, scroll behavior and focus recovery after a source disappears; use one shared policy rather than separate handlers per surface

**Invariants:** INV-01, INV-14
**Checks:** `web`; `rendered`; PostgreSQL-profile browser move/menu journey

## LIB-23 Letter-spacing defaults that yield to tracking utilities

`P3` · `S` · Build · Web

Depends on: none

Context: LIB-19 set per-size letter-spacing defaults in `web/src/styles/index.css` as unlayered `[class*="text-"]` and `.text-*` rules. Unlayered rules beat every layered Tailwind utility, so any `tracking-*` class on an element with a `text-*` class is ignored: not-found's `tracking-tight`, the `tracking-*` in `lib/ui` command, dropdown-menu, context-menu and empty, and sign-in's error-page label, which needs `tracking-[0.08em]!`.

**Why.** A design-system utility that silently does nothing invites wrong fixes, such as `!important`, and hides what a screen will look like.

**Outcome.** The size defaults move into `@theme` as `--text-*--letter-spacing` values, or into `@layer base`, so `tracking-*` utilities win again, and the `!` on sign-in's error-page label goes.

**Acceptance**

- A `tracking-*` class beside a `text-*` class takes effect, shown by a unit or rendered check
- Pixel diffs at 1440×900 and 390×844 for the shell, sign-in, not-found and the Library list name each changed screen; the not-found heading tightening is expected, other changes are reviewed rather than accepted automatically

**Checks:** `web`; `rendered`

## LIB-24 Sort by kind

`P2` · `M` · Build · Backend, Web · *Public API change*

Depends on: none

Context: LIB-04's table shows a Kind column (File, Folder, or a family such as Image or PDF) derived in the web client from the media type and extension, but `GET /api/v1/entries/{id}/children` sorts only by `name`, `updatedAt` and `size`. LIB-03's V9 triggers copy each entry's kind, `updated_at` and current size onto `catalog_names` for keyset paging.

**Why.** Grouping a folder by type is how people find "the PDFs" or "the photos" in Finder, Explorer and Drive. A Kind header that cannot be clicked looks broken next to the sortable ones.

**Outcome.** A `kind` sort field that orders by a server-owned type family, with name as the tiebreaker, and a sortable Kind header and Sort menu entry.

**Settle first.** Whether the family is computed by the server (one mapping shared with the web's `entryKind`, exported in the contract) or stored per version at upload; how unknown types order; whether a migration backfills the copied sort key.

**Acceptance**

- `sort=kind` pages stably in both directions with keyset cursors, folders-first and the `kind` filter, and a cursor from another sort is rejected
- The family shown in the Kind column and the order agree for every family the web knows
- The Kind header and Sort menu sort through the URL like the other fields

**Invariants:** workspace-scoped listing; no internal storage paths in the sort key

**Checks:** `backend` (PostgreSQL-backed paging tests); `contract`; `web`; `rendered`

