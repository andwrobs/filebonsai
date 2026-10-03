# Verified status and next work

Updated 2026-09-30. This is the only live status and sequencing document. Record only
observed results; use Git history for prior plans and completed migrations.

## Current implementation

- The repository root is the Git root. `backend/` is an executable Java 21 modular
  monolith. `web/` is a React Router single-page Catalog client; `ios/` remains a
  planned application root.
- Catalog is organized as `domain`, `application`, `web`, `persistence`, and `support`,
  with cross-capability HTTP code under `platform/web`.
- Java controllers/DTOs author the OpenAPI contract. Pinned TypeScript and Swift
  generation is reproducible; generated output remains disposable.
- Flyway V1–V6 define workspace membership, names/reservations, entries, immutable
  versions/objects, idempotency, local-owner sessions, credential-reset replay, login
  throttling, checks, and PostgreSQL guarantees.
- Flyway V7 and the local-transfer adapter provide durable upload intent, streamed
  size/digest verification, whole-body retry, cancellation, restart reconciliation,
  and immutable original download. Finalization pins its name reservation until
  publication or recovery resolves it; safely expired sessions release the name.
- Flyway V8 and the optional R2 publisher add durable provider attempts, 8 MiB
  multipart parts, server-held credentials intended for one bucket, full-object
  SHA-256 readback,
  unique keys for uncertain retries, and periodic recovery. The local provider is
  still the default. R2 behavior has passed PostgreSQL tests with an injected gateway;
  it has not been exercised against a real R2 bucket.
- An opt-in real-bucket proof runner now prepares deterministic synthetic bodies,
  PostgreSQL-backed transfer scenarios, injected uncertain responses around real
  provider calls, bounded resource observations, and prefix-scoped cleanup. Its local
  fixture, fault-ordering, and gate checks pass; no live R2 result has been observed.
- The jOOQ PostgreSQL adapter remains behind operation ports. Its 17 Testcontainers
  tests cover workspace scope, deterministic ordering, reservations, idempotency,
  rollback/concurrency, immutable identities/versions/objects, domain constraints,
  root protection, generated-schema drift, and the listing orders below.
- `GET /api/v1/entries/{id}/children` takes optional `sort` (`name`, `updatedAt`,
  `size`), `order` (`asc`, `desc`), and `foldersFirst`. Each order ends in name bytes,
  then UUID; a folder sizes below any file. Cursors are bound to all three, and
  default-order cursors issued before they existed still work. Flyway V9 copies each
  entry's kind, `updated_at`, and current size onto its name row through triggers, and
  four partial indexes page every order without a sort. Optional `kind` (`folder` or
  `file`) limits a page to one group in the same order; a filtered cursor is bound to
  the kind as well, unfiltered cursors keep their tokens, and no migration was needed
  (the existing indexes serve both groups in every order). The folder tree uses
  `kind=folder`; the Library's table, grid and sort menu use `sort`, `order`, and
  `foldersFirst`.
- The PostgreSQL profile exposes authenticated Catalog HTTP through session-derived
  membership scope. Local-owner access includes secret-file bootstrap/reset,
  PostgreSQL-backed sessions, rotation/logout/reset invalidation, CSRF, persisted
  login throttling, generic failures, and secure-by-default cookies.
- The local Docker Compose stack runs PostgreSQL, the backend, the web client, and
  Authentik. Authentik OIDC sign-in is pinned to its administrator UUID and issues
  the existing PostgreSQL-backed Filebonsai session. A different Authentik user is
  denied before a Filebonsai session is created.
- Local-owner bootstrap atomically creates the principal, owner credential, initial
  workspace membership, workspace, and protected `Library` root. Repeated bootstrap
  fails without replacing the packet; restart preserves authenticated catalog access.
- The committed OpenAPI is exported from the PostgreSQL profile and includes Access
  and Catalog. The fixture profile still authors deterministic response fixtures.
- `web/` is a React Router SPA built on the React Router SPA starter (decision 0011):
  code in `src/` with route folders and named `src/lib` capabilities, services built
  once in `src/services.ts`, TanStack Query for remote data, a Zustand store for
  uploads, Biome, and Vitest. `npm run e2e` runs a Playwright journey against a
  disposable PostgreSQL-profile stack (ENG-02). Its transport is a generated `openapi-typescript` schema
  wrapped by an `openapi-fetch` client that holds the CSRF token. It discovers
  the session workspace root, browses direct children, navigates folders, handles
  password sign-in for anonymous visitors (plus **Continue with Authentik** when
  `VITE_FILEBONSAI_OIDC=authentik`), loading/empty/error/not-found states, and exposes
  TanStack Form folder creation
  with caller-owned idempotency keys. The boundary includes cookie credentials, CSRF
  refresh/rotation handling, and pagination.
- Web Catalog now provides multi-file upload and original download controls. A tab-owned
  transfer store survives folder navigation, retains begin idempotency keys, checks
  durable state before whole-body retry, fences late replies after cancellation, and
  refreshes CSRF for explicit transfer operations. Sending progress is indeterminate;
  uncertain completion requires an explicit status check. Closing/reloading the tab
  does not preserve its selected files or upload tracking.
- Authenticated `GET /api/v1/upload-limits` exposes the effective `maximumBytes`
  (the smaller of the staging and publisher limits, the value begin-upload enforces).
  The web transfer store reads it once per tab and refuses larger files before
  `beginUpload`, naming the limit; an unreadable limit or a `413` defers to the server.
- Authenticated `GET /api/v1/storage` describes the configured connection (operator
  display name, open-vocabulary provider kind), transfer capabilities, and committed
  `usedBytes` for the member's workspace. It carries no bucket, account, endpoint,
  credential, or path. The web `/storage` page shows it with the upload limit and has its
  own loading, error, and unavailable states. The shell links Library and Storage in
  every layout.
- File responses carry `versionCount`, the current version's verified `sha256` (null
  only for an object recorded without one), and `storageConnectionName`, the configured
  connection's display name. The inspector lists them, with a copy button for the digest.
- The web shell follows the design reference. `web/src/styles/index.css` is the one
  source of color, type, spacing, radius, density, and region-size tokens, mapped onto
  the shadcn roles `lib/ui` uses, with the system font stack (no Geist). The shell,
  transfer tray, floating upload, sign-in, not-found page, and Library list use
  `lib/ui` and Tailwind utilities (sign-in's password field through the `lib/form`
  TanStack Form bindings). The inspector and Storage still read `app.css` through
  role aliases in `tokens.css`, which holds no colors. `tokens.test.ts` fails on raw
  colors outside `index.css` and checks AA text
  and 3:1 control and focus contrast on its roles.
  Icons are Lucide (ISC); the identity uses supplied SVG artwork for the shell,
  sign-in, favicon, and touch icon. A
  pathless layout route keeps navigation and the transfer tray mounted across Library
  and Storage. The shell shows a full sidebar from 1100px and an icon rail from 768px.
  Below 768px it has a top bar, bottom navigation, and a floating upload button, with
  safe-area padding. Kind is display-only and comes from the filename extension. Uploads sit in a bottom tray. It opens when an upload starts or
  needs attention and folds away once everything settles. On phones the floating
  upload button sits above the tray at its measured height. The sidebar's
  Storage entry shows the connection name and committed bytes. The Recent, Shared,
  and Archive placeholders are gone.
- Breadcrumbs show the real folder path (M1-02). `getEntry` returns a folder's
  root-to-parent `ancestors` from one workspace-scoped recursive query capped at 1024
  levels; listings and `getWorkspaceRoot` omit them. The header shows the root, a '…'
  menu, and the current folder. From 1024px it shows up to the last two parents and
  hides the menu when they are the only middle segments. Below 30rem the toolbar drops
  to its own row. Long names truncate and keep their full text for assistive tech.
  Folder creation has no depth limit yet, so a folder deeper than the cap reads as a
  `500` (ORG-15).
- The Library has an inspector (`web/src/routes/library/components/Inspector/`). Each row has
  a Details button. The toolbar's Details toggle shows the current folder when no row
  is chosen. The inspector shows name, kind, rounded and exact size, created and
  modified date and time, and the entry ID with a copy button. Files get Download and
  child folders get Open folder. There are no tabs. From 1100px it is a sticky third
  column, and this browser's local storage remembers whether it is open. Below 1100px
  it is a modal drawer, and below 768px a bottom sheet; neither opens by itself. Esc
  and Close return focus to the button that opened it.
- The Library header, breadcrumbs, toolbar, new-folder form, empty state, and entries
  use `lib/ui` controls and Tailwind utilities. The Library rules have left
  `app.css`; its remaining rules style the inspector, Storage, and shared legacy page
  controls.
- A folder's entries show as a table or a grid (LIB-04). The table is React Aria's
  `Table` (name, kind, size, modified, actions). Name, Size and Modified headers sort
  through the server: the same header flips direction, and a new one starts at A to
  Z, largest, or newest. Kind can't be sorted. A Sort menu offers the same fields, both
  directions, and Folders first, for the grid and for touch. The order lives in the
  URL (`sort`, `order`, `folders=first`, defaults left out) and replaces the history
  entry, so Back leaves the folder, a reload keeps the order, and links elsewhere open
  the default. Each order is its own first-page query; the folder's details are a
  separate query, so the tree's reveal never waits on a sort. The grid is a React
  Aria `GridList` of tiles with a large type icon, a two-line name, size or kind with
  the date, and Download and Details. The Table and Grid toggle is a per-viewer
  preference in this browser's local storage (`lib/preferences` holds the shared
  safe storage the tree also uses). The table drops Kind below 44rem of list width
  and becomes two-line rows below 30rem (so beside the docked inspector at 1100px).
  Below 768px both views are rows and the toggle is hidden. Rows and tiles are
  focusable: arrows move between them (in two dimensions in the grid), Right moves
  into a table row's cells, Tab reaches a tile's buttons, and Enter opens a folder. Only the first page of 50 still loads.
- The shell shows a folder tree: in the sidebar from 1100px under the Library item,
  and in a left sheet opened from a Folders button on the icon rail and in the phone
  top bar (the sheet closes on navigation). It is React Aria's `Tree` inside a
  `Virtualizer` with fixed row heights taken from the control and touch tokens, so only
  the rows in view are mounted. Subfolders load 100 at a time with `kind=folder`, and
  only for opened folders. Rows are links and the tree selects nothing. The keyboard
  model is the tree's: arrows, Right to open or enter, Left to close or go to the
  parent, Home, End, type-ahead. Opened folders persist in `localStorage` (500 most
  recent). Opening a folder reveals its ancestors, pages to it, and scrolls it into
  view from the query cache without moving focus; the current row is marked. Later
  pages of a listing load once the user has scrolled or typed, so revealing never
  pushes the current folder back out. The inline tree mounts only at the wide
  breakpoint; the sheet's tree only while it is open. At 1,000
  subfolders the tree held 21 rows in the DOM, and the browser reported no long task
  (max 0 ms) while paging in or during 30 ArrowDown presses.
- The inspector previews authorized originals for JPEG, PNG, GIF, WebP, AVIF, and
  `.txt`/`.log` files. It selects a Blob type from the allowed extension, caps images
  at 5 MiB and text at 256 KiB before requesting content, and checks the returned
  body size too. Other types, oversized files, and failures leave Download available.
  Image object URLs are revoked when the preview closes or changes.

## Latest observed checks

- Selection (LIB-05 and its follow-up): table, grid and phone rows share one entry-ID
  selection per folder, owned by the Library route. Click selects, Cmd/Ctrl toggles,
  Shift extends through the displayed order, arrows move the selection (as in Drive
  and Finder), Escape in the listing clears it, and double-click or Enter opens a
  folder; on touch a tap opens, while Select (or a long-press) enters a mode where
  taps toggle. A click on empty space clears the selection; entries, controls, fields
  and the inspector keep it. The inspector shows the selection: the folder when
  nothing is selected, the entry when one is, and a count with file/folder totals for
  several. A row's Details button makes that entry the selection and opens the
  inspector. A fixed-height bar announces the item or selection count with Select all
  (loaded entries) and Clear/Done. Selection survives sorting and view switches,
  refreshes prune missing IDs, and another folder starts empty. The follow-up
  removed the hook's document and window listeners and the separate inspected-entry
  marker. `cd web && npm test` passed (Biome, typegen and `tsc`, 155 Vitest tests,
  build). `npm run e2e` against the disposable PostgreSQL-profile stack passed all
  15 desktop and phone tests, including Details following click, Details buttons and
  arrows, the several-selected summary, and the empty-space clear at 1440×900. No
  load-more control exists yet, so survival across further pages is covered only by
  the ID-keyed model.

- Combined Library merge verification (PRs #32/#33): `cd web && npm test`
  passed Biome, route typegen/TypeScript, 147 Vitest tests and the production build.
  `cd backend && ./scripts/verify.sh` passed 102 backend tests (the opt-in live-R2
  proof skipped), including 20 PostgreSQL Catalog tests, TypeScript client checks
  11/11 and Swift checks 12/12. Exported contracts/fixtures and
  `cd web && npm run generate:schema` reproduced the committed files without drift.
  `npm run e2e` with an output/reporting-only config override passed 12 desktop/phone
  tests, with two desktop-only scenarios skipped on phone. Regression scenarios
  exercised revealing sibling folder 1,050, closing the rail's folder sheet on
  1024px → 1440px → 1024px resize, and consecutive sort choices while the preceding
  listing request was held. The 1,100-folder tree kept 21 rows in the DOM; its longest
  browser task was 77 ms at boot, with no long task during paging or 30 ArrowDown
  presses. Screenshots of the desktop table/grid and phone rows/folder sheet were
  inspected at 1440×900 and 390×844. Fresh contract, persistence and web reviews found
  no remaining blockers after the reveal, resize, pending-menu and query-fixture
  repairs. An additional PostgreSQL browser check passed for a folder at 503
  levels, with its current row and label visible before and after reload; its
  screenshot was inspected. Active ancestor expansion is now independent of the
  500-ID persistence cap, and visual indentation is capped while ARIA depth stays
  exact. Ten store tests cover the cap and deep-trail recovery; the final Library
  route test run passed 21 tests, including explicit reversed menu selections.
  These checks used disposable PostgreSQL and synthetic local originals.

- Table and grid views (LIB-04): `cd web && npm test` passed (Biome, typegen and
  `tsc`, 140 Vitest tests, build). They cover header sorting with `aria-sort` and the
  URL, loading an order from the URL and ignoring unknown values, the Sort menu with
  Folders first, the grid remembered in local storage, rows and no toggle on a phone,
  and ArrowDown then Enter opening a folder. `npm run e2e` passed 10 tests on desktop
  and phone (two skipped on phone by design). The new one uploads a 1 KiB and a 64 KiB
  file beside a folder: sorting by Size (header on desktop, menu on the phone) put the
  larger file first and the folder last, Folders first moved the folder ahead, and a
  reload kept both. On desktop ArrowDown moved row focus, the grid survived a reload,
  and ArrowLeft then Enter on a tile opened the folder. Screenshots against the
  disposable PostgreSQL-profile stack at 1440×900 (table sorted by Size, row and cell
  keyboard focus, docked inspector, Sort menu, grid with and without the inspector,
  grid keyboard focus), 1100×900 (docked inspector, rows), 1024×768 (table and grid
  beside the rail), and 390×844 (rows, Sort menu, sorted by Modified) were inspected.
  They caught and verified fixes for an inspected row that took `lib/ui`'s expanded
  tint instead of the selection color, rows taller than the row token, and focus rings
  that never drew because `outline-none` also cleared the ring's outline style.

- Folder tree (LIB-02): `cd web && npm test` passed (Biome, typegen and `tsc`, 130
  Vitest tests, build). `npm run e2e` passed 8 tests on desktop and phone (two are
  skipped on phone by design). They cover a three-level path revealed after reload,
  with both ancestors open and the current row in view, arrow-key movement and Enter,
  expansion surviving a reload, and the phone sheet closing on navigation with no
  horizontal overflow. Another desktop test put the current folder below a large open
  sibling that still has a next page, and checked that it lands at the bottom edge of
  the tree. A last test made 1,000 subfolders through the API: all reached by
  scrolling, 21 rows in the DOM, the current folder 900 revealed and in view after a
  reload, and a `PerformanceObserver`
  reported no long task above 50 ms (the un-virtualized tree had peaked at 291 ms).
  Screenshots at 1440×900 (sidebar, with keyboard focus), 1024×768 (rail and open sheet)
  and 390×844 (top bar and open sheet) against the disposable PostgreSQL-profile stack
  were inspected for truncation, the current row, Storage staying in view, and no
  overflow.

- Breadcrumbs from real ancestors (M1-02): `cd backend && ./mvnw test` passed,
  including `PostgresCatalogTest` 19/19 against PostgreSQL with ancestry at depths
  1, 2 and 50 and three indistinguishable not-found cases. `./scripts/verify.sh`
  passed (export, generation, TypeScript and Swift checks decoding both
  `EntryDetailsResponse` variants). `cd web && npm test` passed (Biome, typegen and
  `tsc`, 92 Vitest tests, build). `npm run e2e` passed desktop and phone, including a
  five-level path that checks collapse per viewport, no horizontal overflow, and
  opening the '…' menu and choosing a parent by keyboard. Rendered screenshots at
  1440×900 and 390×844 were inspected; they caught and verified the fix for a phone
  header that overflowed to 650px.
- Library list on the design system (LIB-21): `cd web && npm test` passed
  (Biome, typegen and `tsc`, 91 Vitest tests, build). `npm run e2e` passed the
  desktop and phone PostgreSQL-profile journeys. A disposable PostgreSQL-backed
  Playwright comparison rendered the same 45 synthetic folders on current `main`
  and this change at 1440×900, 1100×900, 1024×768, and 390×844; it checked the
  docked inspector, Kind-column drop, and unbroken long-name wrapping. A second
  comparison covered empty, focused and invalid new-folder forms, and a real
  not-found response at desktop and phone widths; closing the phone inspector
  restored focus. The Library form test checked labelled validation and blocked
  submission.
- Sign-in and not-found on the design system (LIB-20): `cd web && npm test` passed
  (Biome, typegen and `tsc`, 90 Vitest tests, build) and `npm run e2e` passed (phone
  and desktop). Playwright pixel diffs against LIB-19 on the shared PostgreSQL-profile
  backend at 1440×900 and 390×844 (touch) were 0 for sign-in resting, focused on
  load, pending (login request held) and a wrong password at 1440, the Authentik
  variant (resting, and hover at 1440), the sign-in error page (session check failed
  with an injected 500), and not-found resting and hovered; every sign-in and
  not-found state, the empty submit included, rendered identically with `app.css` and
  `tokens.css` switched off, since `app.css`'s bare input rule now skips `lib/ui`
  inputs (the new-folder input was unchanged). Pending at 390 differed by 11
  anti-aliased input-corner pixels. Focus lands on the password on load and after a signed-out
  redirect, the field clears after a failure, and tab order is unchanged. Intended
  differences: an empty submit shows an inline "Enter the password." error linked to
  the field, with a red border and label, instead of the browser's bubble (focus
  still moves to the field); after a tap at 390 the Sign in button no longer keeps its
  hover fill. The not-found page needed no change.
- Design system tokens and shell (LIB-19): `cd web && npm test` passed (Biome,
  typegen and `tsc`, 88 Vitest tests, build), and `npm run e2e` passed after
  rebasing onto ENG-02; `tokens.test.ts` now reads the light roles in `index.css`. Playwright pixel diffs against `main` on the shared
  PostgreSQL-profile backend at 1440×900, 1024×768, 768×1024 and 390×844 (touch at the
  last two) were 0 for the Library root, the 45-item folder, Storage, the inspector,
  the transfer tray and sign-in, and for skip-link focus, tab order, keyboard focus and
  a busy upload. Nav hover matched at 1440 and 1024; a collapsed tray differed by one
  anti-aliased focus-ring pixel at 768. Intended differences: the not-found
  page (already on `lib/ui`) takes Filebonsai's colors, button density and hover
  (a mouse hover darkens it to `primary-hover`) and its `space-y` gaps now apply; hover fills in the shell and tray no longer stick on
  touch-only pointers. Coarse pointers keep 44px nav targets.
- Playwright end-to-end harness (ENG-02): `cd web && npm run e2e` (pinned
  `@playwright/test` 1.59.1, cached Chromium 1217) passed twice in a row, each in about
  12 s with the backend jar already built. Each run started `postgres:17.6-alpine` on a
  free port and this branch's PostgreSQL-profile jar with a generated owner password.
  It served the production web build through `vite preview`. The `desktop` (1440×900)
  and touch `phone` (390×844) projects, both with reduced motion, signed in, created
  and opened a folder, and uploaded a 256 KiB synthetic body through the file chooser
  (toolbar on desktop, floating button on the phone). The downloaded file's SHA-256
  matched, and after sign-out `/api/v1/auth/me` returned 401 and `/` showed sign-in.
  Sign-out calls the logout API because the shell has no control for it (M1-14). No
  container, process, or temporary directory remained after a pass, a Ctrl-C, or a
  SIGTERM. Without Docker the
  run stops with a one-line message. On the first run, with the two projects in
  parallel, the desktop upload's `complete` returned 503 `Upload completion requires
  reconciliation` while the phone's succeeded. The cause is concurrent creation of the
  first storage directory (`LocalObjectStorage.ensureDirectory`); PR #25 fixed it,
  and the two projects now run in parallel again. That failure printed its screenshot and the
  `npx playwright show-trace` command. `cd web && npm test` passed Biome over 163 files,
  typegen and `tsc` including `e2e/`, 86 Vitest tests, and the build.
- Local storage directory race: two first uploads into a new workspace could both find
  its `objects/` (or `attempts/`) directory missing, and the second
  `Files.createDirectory` threw `FileAlreadyExistsException`, which `complete` turned
  into 503 "Upload completion requires reconciliation". `ensureDirectory` now accepts a
  concurrently created component only after the same no-follow check rejects symbolic
  links and non-directories. Transfer storage failures log a WARN with the upload ID and
  exception class, never the message, which names the storage path. On the old code,
  the new `LocalObjectStorageTest` concurrency test (16 writers then 16 promoters behind
  a start gate, 25 rounds) failed with `FileAlreadyExistsException`; with the fix it
  passed three times. `./mvnw test -Dtest='LocalObjectStorageTest,PostgresLocalTransfersTest,PostgresR2TransfersTest'`
  passed 34 tests against PostgreSQL 17 Testcontainers, including 8 concurrent first
  completions that all became available and downloaded intact, and rejection of a
  regular file, a dangling symbolic link and a symbolic link at a workspace directory.

- Inspector integrity fields (LIB-14): targeted `cd backend && ./mvnw test` runs
  passed `CatalogHttpTest` (8), `FixtureCatalogTest` (20), `PostgresCatalogTest` (18,
  PostgreSQL 17 Testcontainers) and `AccessHttpPostgresTest` (12). The new PostgreSQL
  test reads a legacy null digest and a count of 1, then a second version's digest and a
  count of 2 through both get and list. The listing index-plan tests still pass with the
  object join and version count. Over HTTP, an upload's entry returned its computed
  digest, the configured display name and `versionCount` 1, and `currentVersion` has
  exactly `id`, `sizeBytes`, `sha256` and `storageConnectionName`. `./scripts/verify.sh`
  passed with 94 backend tests (1 opt-in R2 proof skipped), export, generation and
  both clients. The added client checks then passed (Swift 11, TypeScript 10),
  including a null digest. `cd web && npm test` passed with 86 Vitest tests and the
  build. A disposable PostgreSQL 17.6 container backed this branch's PostgreSQL-profile
  backend (display name `Studio NAS`) with three synthetic uploads. Two SQL edits added
  versions: one file had 3, and another had a current version whose object had no
  digest. In the Claude desktop in-app browser at 1440×900, the docked inspector
  showed Versions 3, Stored on Studio NAS, and a SHA-256 equal to `shasum -a 256` of
  the uploaded body. The legacy file showed "Not recorded" with no copy button, and
  the earlier copy message did not carry over. At 390×844 with touch emulated, the
  sheet showed a 94-character name and a wrapped digest that matched its upload. Both
  copy buttons measured 44px, and nothing overflowed horizontally. Copy SHA-256 showed
  its fallback message because the in-app browser denies clipboard writes.
- Web on the SPA starter (decision 0011), reached `main` at `cb62fd1` without a pull
  request: on `main` at `642aea6`, `cd web && npm ci && npm test` passed Biome over 153
  files, route typegen and `tsc`, 85 Vitest tests in 23 files, and the SPA build, on
  local Node 23.7/npm 10.9 (the starter targets Node 24; `node:24-alpine` builds the
  image). The ported transfer, CSRF, preview-policy, inspector-state, and formatting
  tests keep their assertions; route tests now cover Library, Library home, sign-in,
  and Storage against a stubbed API. `npm run generate:schema` reproduced the
  committed schema byte for byte. A disposable PostgreSQL 18.4 cluster and this
  branch's PostgreSQL-profile backend (1 MiB upload limit, synthetic files) served
  `main`'s client and this branch's side by side. Per-element box and computed-style
  fingerprints matched at 1440×900 and 390×844 for sign-in, Library, the docked
  inspector with an image preview, the phone sheet with a text preview, the new-folder
  form, the transfer tray, and Storage. The only differences were Tailwind preflight
  defaults with no layout effect (button padding inside fixed-size icon buttons, the
  hidden skip link's underline) and the missing-folder heading, which now reads "This
  folder is not available." where `main` showed the server's reason phrase. On this
  branch, a wrong password showed its message and cleared the field; empty-name
  validation and folder creation refreshed the list; a small upload became available
  and refreshed the list and storage summary; a 2 MiB file was refused before begin
  after one shared and one confirming limit read; Back/Forward, direct loads of
  `/storage` and a folder, and the 900px rail worked; signed out, `/storage` went to
  sign-in. Focus moves to the new page's heading on navigation. Storage lost that
  focus when its data replaced the loading heading; one heading now spans both states,
  with a regression test. A fresh read-only review found no blockers; its fixes are in
  `876ec09`. Folder creation reads a new CSRF token each time again, as before the
  port, so a sign-in in another tab can't leave it failing with the held token. A
  failed Storage read now wins over values cached from an earlier visit. Preview
  loading moved into `usePreview`, sign-in keeps no password in the mutation cache once
  an attempt settles, and the upload limit stays cached for the tab. New tests cover a
  late create reply after moving to another folder (it refreshes its own folder and
  leaves the new form open), cache clearing and password retention on sign-in, a fresh
  token per creation, and a failed Storage revisit; each was confirmed to fail without
  its fix. Against the disposable backend, `main`'s client then showed the image and
  text previews, revoked the image's Blob URL when the selection changed, signed in
  after a wrong password, and showed "Storage details are unavailable" on a revisit
  after the backend stopped.
- Server-side sort (LIB-03): `cd backend && ./mvnw test` passed 93 tests with one
  skipped, the opt-in real-R2 proof. PostgreSQL 17 Testcontainers tests covered three
  things. The copied sort keys matched their source after publication order, a name
  written before its version, an `updated_at` change, and a direct overwrite. All 12
  orders were paged 3 at a time with 2 inserts between pages: positions strictly
  increased, nothing repeated, and every earlier entry and every insert ahead of the
  cursor came back. `EXPLAIN ANALYZE` over 10,000 children (1,000 folders) ran for every
  order and group, from the start and from a mid-page cursor. Each run was an index scan
  on an `ix_catalog_names_page*` index with no Sort or Seq Scan node. It returned 51
  rows, filtered out at most 16, and took at most 0.25 ms. HTTP tests covered invalid
  and coerced values and cursors reused across orders. `./scripts/verify.sh` passed:
  TypeScript 9/9 and Swift 10/10, each including a check of the new query parameters.
  The regenerated web schema passed `npm test` (43), `typecheck:run`, and `build`.
- Browser originals preview (PRV-09): `cd web && npm test && npm run
  typecheck:run && npm run build` passed with 43 tests, strict TypeScript, and a
  production SPA build. The new policy tests cover allowed types, excluded markup,
  and exact size boundaries. In the in-app browser against a disposable PostgreSQL
  17.11 backend with synthetic originals, the inspector showed a raster image and
  escaped text at 1440×900 and 390×844. Loading, unsupported Markdown, an over-limit
  text file, and a corrupt-image failure were observed with Download still present.
  On the phone the page had no horizontal overflow; after closing the sheet, fetching
  its captured image Blob URL failed, confirming revocation. No real R2 provider was
  involved.
- Web identity: `cd web && npm test && npm run typecheck:run && npm run build`
  passed with 40 tests, strict TypeScript, and a production SPA build. The supplied
  SVGs rendered in sign-in and the shell at 1440×900, in the icon rail at 900×900,
  and in the phone shell at 390×844. A local fixture server supplied synthetic
  Catalog responses for visual inspection; no authenticated backend flow was tested.
- Inspector (LIB-06): `cd web && npm test && npm run typecheck:run && npm run build`
  passed with 40 tests, strict TypeScript, and a production SPA build. New tests cover
  the inspector's open/target rules, storage that refuses access, full dates, and exact
  byte counts. The check ran against a disposable PostgreSQL-profile backend: a
  PostgreSQL 17.6 container, a generated owner password, and a synthetic 47-entry
  folder. That folder included a 92-character folder name and a 100-character file
  name, neither with spaces. In the Claude desktop in-app browser the inspector was
  docked at 1440×900 and 1100×800, a drawer at 1024×768 and 768×1024, and a sheet at
  390×844 and 375×667 with touch emulated. No size scrolled horizontally. At phone
  sizes every inspector control measured 44px. Enter on a row's Details button opened
  the inspector and focused its heading. Esc and Close returned focus to that button.
  The drawer kept Tab inside, locked page scrolling, and closed on a backdrop click but
  not on a click inside it. After a reload at 1440×900 the docked inspector reopened on
  the folder itself without moving focus, and at 1024×768 the drawer stayed closed.
  Open folder from the phone sheet navigated and closed the sheet. Download from the
  inspector fetched the original and passed a blob to the browser; the save step was
  intercepted so no file was written. Copy ID showed its fallback message because the
  in-app browser denies clipboard writes, so a successful copy was not observed.
  A fresh read-only review found two problems. A drawer or sheet could reopen after
  Back navigation or after crossing the 1100px breakpoint twice. Closing from the
  toolbar also moved focus to a row. After the repairs, the rendered recheck passed.
  Back at 390×844 left the sheet closed. Going 1024×768 → 1440×900 → 1024×768 closed
  the drawer, returned focus to its row button, and did not reopen it. Closing the
  docked column from the toolbar kept focus on the toolbar button.
- Responsive shell (LIB-01, LIB-10): `cd web && npm test && npm run typecheck:run &&
  npm run build` passed with 32 tests, strict TypeScript, and a production SPA build.
  The tests include new kind and date helpers, token contrast, and a no-raw-colors scan.
  The check ran against a disposable PostgreSQL-profile backend: a PostgreSQL 17.6
  container, a generated owner password, and a synthetic library of 70 entries. In the
  Claude desktop in-app browser at 1440×900, 1024×768, 768×1024, 390×844, and
  375×667, no size scrolled horizontally. At phone sizes, with touch emulated (coarse
  pointer), every visible control measured at least 44px. With a fine pointer, icon
  buttons are 36px. The run covered sign-in, the root, a nested folder, an
  empty folder, a 45-item folder, long names without spaces, and folder creation
  with validation. Two uploads reached `AVAILABLE` through the tray. Original download,
  the Storage page, and keyboard focus order with the skip link also passed. After
  review repairs, a second disposable backend rechecked 390×844 and 1440×900. That
  run covered sign-in at 390×844 and the tray folding away after two uploads settled.
  A 135 MB file was refused before sending. The tray reopened with the refusal and
  the floating upload button sat above it, then moved down when the tray collapsed.
  Input borders now meet 3:1. Creating a folder with an existing
  sibling's name returned `500` instead of `409 NAME_CONFLICT`. That bug predates
  this change and is recorded as M1-13.
- Storage page (M1-09): `cd backend && ./scripts/verify.sh` passed with 87 backend tests
  (1 opt-in R2 proof skipped), OpenAPI export, TypeScript client 8 tests, and Swift
  client 9 tests, including `StorageSummaryResponse` decoding with an unknown provider
  kind. `PostgresCatalogTest` checks the exact committed sum (9,007,199,254,740,993), a
  principal in two workspaces seeing only each workspace's own versions, and zero for a
  non-member. The PostgreSQL HTTP test checks anonymous `401`, the configured display
  name, `no-store`, the exact serialized field set, no storage-root path in the body, and
  `usedBytes` staying `0` while an upload is `STAGED`, then matching after completion.
  An allow-list serialization test covers both providers and an upper-case `R2` setting. `cd web && npm test && npm run
  typecheck:run && npm run build` passed with 26 tests. Rendered against a disposable
  PostgreSQL-profile backend at 1440×900 and 390×844: signed-out redirect to sign-in;
  populated page with a 73-character display name wrapping, 700 KB stored while a
  300 KiB upload stayed `STAGED` and uncounted, and the 1 MB limit; loading while
  PostgreSQL was paused; unavailable with PostgreSQL stopped; and the error state with a
  request ID from an intercepted `500 INTERNAL_ERROR` (client fixture). No mobile
  horizontal overflow. With PostgreSQL stopped, the API returned Spring's default error
  body rather than the API error shape (recorded as ENG-13).
- Upload limits (M1-04): `cd backend && ./scripts/verify.sh` passed on Java 25.0.3 with
  PostgreSQL 17.11 through Docker Desktop 24.0.5: 83 backend tests (1 opt-in R2 proof
  skipped), OpenAPI export, TypeScript client 7 tests and Swift client 8 tests,
  including new `UploadLimitsResponse` decoding. The HTTP test configures a 50,000,000
  byte limit and checks anonymous `401`, the exposed value, `no-store`, `413 TOO_LARGE`
  at limit + 1 and `201` at the limit. `getUploadLimits` documents only `200`, `401`,
  and `500`. `cd web && npm test && npm run typecheck:run && npm run build` passed with
  20 tests, including a re-read before refusing and a re-read after `413`. Rendered against a disposable PostgreSQL-profile backend with a 1 MiB limit at
  1440×900 and 390×844: a 2 MiB file showed "Too large to upload: 2 MB is over the
  1 MB limit. Nothing was sent." with no begin request; a 64 KiB file reached
  `AVAILABLE`; a direct begin at 1,048,577 bytes returned `413 TOO_LARGE`. No mobile
  horizontal overflow.
- `cd infra/local && ./up.sh` followed by `python3 check.py`: passed on the initial
  and repeat startup. Authentik readiness/discovery, administrator OIDC sign-in,
  session-backed Catalog root access, and denial of a second Authentik user all
  passed. The repeat startup preserved the `Library` root identity. The local stack
  was left running.
- `cd backend && ./mvnw test -q`: passed, including PostgreSQL Testcontainers
  integration tests. `cd web && npm test -- --run`: passed, 14 tests. The web typecheck
  and production build passed during this slice.
- `cd backend && ./mvnw -Dtest=PostgresCatalogTest test`: passed, 13 tests, PostgreSQL
  17.11 through Docker Desktop 24.0.5.
- `cd backend && ./mvnw -Dtest=CatalogHttpTest test`: passed, 7 tests.
- `cd backend && ./mvnw -Dtest=AccessHttpPostgresTest#protectsWritesWithCsrfAndDerivesCatalogScopeFromTheAuthenticatedMembership test`:
  passed, 1 PostgreSQL Testcontainers test, including authenticated workspace-root
  resolution.
- `cd backend && ./mvnw spotless:apply -Dtest=PostgresLocalTransfersTest,LocalObjectStorageTest test`:
  passed, 14 PostgreSQL transfer tests and 4 filesystem tests. Covers whole-body retry,
  zero-byte originals, size/digest rejection, cancellation fencing, expiry, isolation,
  restart recovery, and name preservation after injected publication failure.
- `cd backend && ./mvnw spotless:apply test -q`: passed, 74 tests, no failures or
  skips on Java 25.0.3 with PostgreSQL 17.11 through Docker Desktop 24.0.5. Includes
  8 R2 PostgreSQL tests for zero/small/multipart bodies, lost provider responses,
  part-list retry, repinning before publication, stale recovery, workspace scope,
  and bounded-download behavior. V8 migration and existing local transfer tests pass.
  Read-only persistence review findings were repaired. No API shape changed;
  contract/client checks were not rerun for this slice. A real R2 run and measured
  provider streaming behavior remain outstanding.
- `cd backend && ./mvnw spotless:apply -Dtest=PostgresR2TransfersTest test -q`:
  passed separately with 10 resource-measurement tests and 11 fault tests on
  PostgreSQL 17.11 through Docker Desktop 24.0.5. The fault suite includes
  terminal-only orphan cleanup, cancellation and name-reservation checks during
  multipart creation, two provider upload IDs for one logical session, and restart
  after an empty listing before delayed creation becomes visible. The late orphan
  is aborted without losing the published object. The resource test's 9 MiB synthetic
  body through a slow/faulting injected gateway
  used 9 MiB of staged disk, then 0 after recovery. In this run, sampled JVM heap
  rose from 94.3 MB to 124.2 MB (5 ms sampling); receive took 12 ms, faulted
  completion 39 ms, reconciliation 454 ms, and verified original download 396 ms.
  The test checks the 128 MiB configured size cap, one-promotion concurrency limit,
  8 MiB maximum part, 64 KiB maximum GET read request, listed-part reuse after a
  lost response, two verification GETs, two download-path GETs, and verification/
  download timeouts. A query completed in 1 ms on the only PostgreSQL pool connection
  while a provider part call was blocked. These are local fixture measurements, not
  R2 latency, memory, disk, or compatibility evidence; the real-bucket proof remains.
- In the combined PR #1–#5 tree, `cd backend && ./mvnw spotless:apply test -q`
  passed on Java 25.0.3 with PostgreSQL 17.11 through Docker Desktop 24.0.5,
  including all 12 `PostgresR2TransfersTest` cases. The opt-in real-bucket proof
  remained skipped.
- `cd backend && ./scripts/generate-clients.sh && ./scripts/check-clients.sh`: passed
  against the exported contract; OpenAPI validation, generated TypeScript compilation
  and 6 decoding tests (including `workspace-root`), plus generated Swift compilation
  and 7 decoding tests all passed.
- `cd web && npm test && npm run typecheck:run && npm run build`: passed with 14
  transport/data/transfer tests, strict TypeScript, and a production SPA build. Tests
  include empty/binary bodies, lost begin/completion responses, whole-body retry,
  cancellation during a pending PUT, CSRF rotation, and download bytes/failure.
- Production web build inspected in Chrome 153.0.8010.50 at 1440×900 and 390×844 with
  synthetic intercepted HTTP responses and reduced motion. Browser checks exercised
  failed upload/retry, reconciliation, folder navigation, availability refresh, and
  browser download; long names wrapped without horizontal overflow. This is client
  fixture evidence. Fresh read-only review found
  no remaining blockers after cancellation and CSRF recovery repairs.
- Isolated local browser check against the actual PostgreSQL-profile backend and
  filesystem storage passed: anonymous redirect to sign-in, owner login, folder
  creation, 65,541-byte binary upload reaching `AVAILABLE`, and byte-identical
  browser download. Desktop and mobile screens were rendered at 1440×900 and
  390×844; neither had mobile horizontal overflow or browser page errors. The
  disposable test database, storage, and password were local only. After the
  sign-in change, `cd web && npm test && npm run typecheck:run && npm run build`
  passed with 15 tests, strict TypeScript, and a production SPA build.
- After merging the password sign-in page with Authentik OIDC sign-in,
  `cd backend && ./mvnw -q spotless:check test -Dtest=AccessHttpPostgresTest` passed
  10 PostgreSQL tests, and `cd web && npm test && npm run typecheck:run && npm run build`
  passed with 15 tests. Against the PostgreSQL-profile backend, anonymous `/` and
  `/library/{id}` redirected to `/sign-in`, which rendered at 1440×900 and 390×844
  without horizontal overflow and showed **Continue with Authentik** only with
  `VITE_FILEBONSAI_OIDC=authentik`. The Authentik round trip was not rerun.
- Swift generator warnings are upstream warnings; generated code was not edited.
- `cd backend && ./mvnw -q spotless:apply -Dtest=R2ProofPayloadsTest,RealR2CompatibilityProofTest test`:
  passed two local tests for deterministic payloads and fault ordering; the real-bucket
  proof was skipped by its required opt-in property. The proof script rejected missing
  settings before Maven.

## Jobs and processing decisions — 2026-09-28

Decisions 0009 and 0010 are accepted through PR #18. Merge review repaired the
same-period deduplication gap and required filesystem/process isolation for both
parser tiers, private per-job spool mounts, and safe output consumption. ENG-04 and
PRV-01 are retired; ENG-05 and PRV-10 implement the decisions. No processing code or
migration was added, and resource budgets remain unmeasured starting points.
A task-scoped documentation validator passed 470 relative links/anchors, 120 unique
backlog items with matching index dependencies, and an acyclic dependency graph;
`git diff --check` passed. Runtime isolation and job guarantees await their build
items and required tests.

## Ordered work

1. Cloud transfer: run the decision 0007 compatibility proof against a disposable
   real Cloudflare R2 bucket, repair any provider mismatch, and record bounded
   streaming/recovery evidence before claiming R2 support or adding another provider.
2. Web interaction polish: on the completed selection (LIB-05), table/grid
   (LIB-04) and folder tree (LIB-02), build M1-11 computer-file drops,
   ORG-01/02/03 mutation rules and
   commands, and LIB-22 shared menus and catalog dragging. Cover grid-folder and
   left-sidebar destinations through one drag owner, with keyboard/touch alternatives.
   Drops, mutations, menus and catalog dragging remain backlog work. ORG-01 is
   proposed as decision 0012 and awaits owner review; ORG-03 (move) starts once it is
   accepted.
   The inspector and Storage move onto `web/src/lib/ui` within LIB-15/16.
3. App-managed storage is near-term work after interaction polish: settle
   [TIER-10](../backlog/storage-tiers.md#tier-10-decision-secure-app-managed-connections),
   build the TIER-03 registry and TIER-11 encrypted credential custody, then TIER-12/14
   setup/routing, TIER-13 onboarding and TIER-15 security/recovery proof. Include CFG-09
   discovery and LIB-16's Storage surface. The decision and fixture-backed work can
   proceed before the live R2 proof; live enablement retains TIER-00's gate.
   The target is adding supported cloud connections in the app without per-connection
   configuration or restart. This is planned behavior; Storage remains read-only.
4. Photo metadata: accepted decisions
   [0009](../decisions/0009-durable-jobs-in-postgresql.md) (durable jobs) and
   [0010](../decisions/0010-media-processing-isolation.md) (processing isolation and
   metadata model). Build ENG-05 and PRV-10, then PRV-04. Both metadata parsing and
   native decoding require the per-job sandbox; an in-backend child JVM is insufficient.
5. iOS Catalog remains deferred by user preference. When resumed, implement the
   SwiftUI/TCA slice through a generated transport and handwritten application adapter.

Each item is split into a bounded task at execution time with owned paths, dependencies,
acceptance criteria, checks, and a handoff. The ordered list is not blanket authority
  to start later work or a substitute for the current task request.

## Unresolved decisions

- Native authentication/session behavior for foreground and background transfers.
- TIER-10's secure app-managed connection decision: owner authority, credential
  submission/custody, encryption-root recovery and config-to-app migration. Decision
  0007 retains R2 as the first provider and the server-mediated transfer boundary;
  dynamic setup does not yet exist, and bucket provisioning remains operator-owned.
- Configurable-shell schema, precedence, persistence, and delivery milestone.
- JavaScript workspace manager, generated-client packaging, and Swift generator path.
- License, contribution/release conventions, supported deployment matrix, backup/
  restore format, retention rules, sharing semantics, and resource limits.
- Service decomposition, deployment platform, and infrastructure-as-code remain
  deferred until concrete operational pressure exists.
