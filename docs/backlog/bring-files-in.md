# Bring files in

Ways to adopt Filebonsai: import an existing folder tree, upload whole folders, install it as an app.

Self-hosters arrive with a disk full of files. Importing a server-side directory tree is probably the most useful adoption feature not yet on the list.

See [the backlog index](README.md) for how to pick up and retire items.

## IMP-01 Import an existing folder from the server

`P2` · `L` · Build · Backend

Depends on: [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer)

**Why.** Self-hosters arrive with a disk full of files, and this is the main way they'll adopt Filebonsai.

**Outcome.** An administrative import of a read-only directory tree into a target folder. It preserves hierarchy, NFC-normalizes names and reports rejected ones, doesn't follow symlinks, can skip duplicates by digest, runs as a resumable durable job, and produces a summary report.

**Acceptance**

- Traversal and symlink fixtures (INV-02)
- Resume after a crash doesn't duplicate entries
- Report lists every skipped item

**Invariants:** INV-02, INV-10  
**Checks:** `postgres`

## IMP-02 Folder upload from the browser

`P2` · `M` · Build · Web

Depends on: [M1-11](finish-m1.md#m1-11-drag-and-drop-upload)

**Why.** Dragging in a folder should keep its structure.

**Outcome.** Pick or drop a folder, create its tree idempotently, then upload the files through the existing transfer store, with progress per folder.

**Acceptance**

- The conflict policy (merge, skip or rename) is decided and tested
- A partial failure is resumable from the list

**Settle first**

- Conflict policy when the target folder already exists

**Checks:** `web`; `rendered`

## IMP-03 Installable web app

`P3` · `S` · Build · Web · Fun

Depends on: none

Context: LIB-01/LIB-10 added the responsive shell: tokens in `web/app/styles/tokens.css` (raw colors anywhere else fail `tokens.test.ts`), Lucide icons, and the `routes/app-shell.tsx` layout route with sidebar, icon rail and bottom navigation. The root layout already sets `viewport-fit=cover` and the phone shell honours safe-area insets.

**Why.** It should be at home on a phone's home screen.

**Outcome.** A PWA manifest and icons, an offline shell with an explicit offline state (no stale data shown as current), and a Web Share Target where supported.

**Acceptance**

- Offline state is honest
- Lighthouse installability passes

**Checks:** `web`; `rendered`

## IMP-04 Spike: read-only WebDAV

`P3` · `S` · Spike · Backend

Depends on: none

**Why.** Mounting the library in Finder or Files is compelling, but the auth model matters.

**Outcome.** Evaluate a read-only WebDAV endpoint: library options, auth (app passwords vs sessions), performance and security review. Recommend yes or no.

**Acceptance**

- Recommendation with its auth implications

**Checks:** `spike-notes`

## IMP-05 Watched drop folder

`P3` · `M` · Build · Backend · Fun

Depends on: [IMP-01](#imp-01-import-an-existing-folder-from-the-server)

**Why.** Scanners and scripts can drop files into a directory, and Filebonsai files them.

**Outcome.** A server-side inbox directory ingested continuously into an Inbox folder, with stable-file detection and dedupe.

**Acceptance**

- Half-written files never ingested
- Restart-safe

**Checks:** `postgres`
