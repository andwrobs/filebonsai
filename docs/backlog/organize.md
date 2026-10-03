# Organize

Rename, move, trash, versions and tags. Every change is metadata, reversible where possible, and audited.

These are the M3 features. They share one set of rules for concurrency, idempotency, bulk results and name reservation, and [decision 0012](../decisions/0012-how-entries-change.md) settles them. Rename and move are metadata only. Trash is reversible. Deleting bytes happens only through a crash-safe job.

See [the backlog index](README.md) for how to pick up and retire items.

## ORG-02 Rename

`P1` · `M` · Build · Backend, Web · Public API change

Depends on: none

**Why.** This is the first metadata mutation and sets the pattern for the rest.

**Outcome.** A rename endpoint with a revision precondition and idempotent replay, returning NAME_CONFLICT on collision; the root can't be renamed. Inline rename in the web client (F2 or Enter to start, Esc to cancel) from the list and the inspector.

**Acceptance**

- Of two concurrent renames, one wins and the other gets the conflict code chosen in decision 0012 (`REVISION_CONFLICT`)
- A pending upload's reservation causes a conflict
- Unicode and 255-byte names; another workspace's entry returns 404
- Physical storage untouched
- On touch screens, row actions move into an overflow menu or action sheet once a row has more than one action

**Invariants:** INV-01, INV-02, INV-05, INV-08  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## ORG-03 Move

`P1` · `M` · Build · Web

Depends on: none

Context: The move API is built (`POST /api/v1/entries/move`, decision 0012). It takes a destination and 1–1,000 entries with their expected revisions under an `Idempotency-Key`, and returns per-item outcomes with each entry's new revision and, for a moved entry, its previous parent. Every entry response now carries `revision`. PostgreSQL tests cover concurrent opposing moves, replay, partial results, selection normalization, the 1,024-level depth limit and untouched storage.

**Why.** Reorganizing a library means moving things, sometimes many at once.

**Outcome.** A 'Move to…' dialog with a folder picker, opened for the current selection from the toolbar, the inspector and the touch actions. Dragging entries to move them belongs to LIB-22, which reuses the same command.

**Acceptance**

- One move command (key created when the user confirms, kept for retries until a result arrives) backs the dialog and later LIB-22's drag targets
- The picker browses folders like the tree, disables the selection's own folders and their descendants, and is usable by keyboard and on touch
- Results are shown per item: everything moved, or which entries stayed and why (name taken, changed elsewhere, not found, too deep); moved entries leave the selection
- Source folders, the destination, the folder tree and open details refresh from `previousParentId` and the destination; ancestors and breadcrumbs follow a moved folder
- An uncertain response retries with the same key rather than moving twice

**Checks:** `web`; `rendered`

## ORG-04 Trash and restore

`P1` · `L` · Build · Backend, Web · Public API change

Depends on: none

**Why.** Deleting must be reversible before anything is deleted permanently.

**Outcome.** Soft delete, where a folder's whole subtree is trashed as one item. A Trash view shows the original location and deletion time. Restore goes to the original parent or a chosen folder, with a conflict flow. Trashed files can't be listed, searched or downloaded.

**Acceptance**

- PostgreSQL tests for trashing and restoring subtrees, name release per decision 0012, and authorization
- Beginning an upload into a trashed folder is rejected
- An undo toast appears after trashing

**Invariants:** INV-01, INV-08  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## ORG-05 Permanent deletion and object garbage collection

`P2` · `L` · Build · Backend, Web

Depends on: [ORG-04](#org-04-trash-and-restore), [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer)

**Why.** Emptying the trash has to free bytes without ever deleting something still referenced.

**Outcome.** When the trash is emptied or retention expires, a durable job deletes catalog rows and then physical objects, local or R2. It never deletes an object that a version still references, and it reports the bytes freed. The UI confirmation names the count and size.

**Acceptance**

- A crash between catalog delete and object delete leaves a tombstone that later runs resolve
- Objects from uncertain uploads are never collected
- Storage and PostgreSQL tests for both providers

**Invariants:** INV-03, INV-07, INV-10  
**Checks:** `postgres`; `web`

## ORG-06 Upload a new version of a file

`P2` · `L` · Build · Backend, Web · Public API change

Depends on: none

**Why.** M1 can't replace a file's contents; domain.md defers this on purpose.

**Outcome.** Begin an upload that targets an existing file entry. The current-version pointer moves only after verified finalization. The UI shows a pending-version indicator.

**Acceptance**

- The old version stays downloadable until the new one is AVAILABLE
- A failed or cancelled new version leaves the file untouched
- Idempotent; concurrent version uploads resolve as decided

**Settle first**

- A separate endpoint vs extending BeginUploadRequest
- Finalization order when two version uploads overlap

**Invariants:** INV-03, INV-04, INV-10  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## ORG-07 Version history

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: [ORG-06](#org-06-upload-a-new-version-of-a-file)

Context: LIB-06 added the inspector, now in `web/src/routes/library/components/Inspector/`. It is a docked column from 1100px, a modal drawer below that and a bottom sheet on phones. Each row's Details button or the toolbar toggle opens it, and it shows the current folder when nothing is chosen. The Details list has size, dates and the ID; there are no tabs yet. The Versions tab is its first tab, so this item adds the tab structure.

**Why.** Immutable versions are a core promise, and users should be able to see them.

**Outcome.** List versions (ordinal, size, SHA-256, created, author), download any version, and restore one by making it current again (a pointer move or a copy, as decided). A Versions tab in the inspector.

**Acceptance**

- Version reads follow source authorization (INV-12)
- Restoring is idempotent and audited

**Invariants:** INV-12  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## ORG-08 Tags

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: none

Context: LIB-06 added the inspector, now in `web/src/routes/library/components/Inspector/`. It is a docked column from 1100px, a modal drawer below that and a bottom sheet on phones. Each row's Details button or the toolbar toggle opens it, and it shows the current folder when nothing is chosen. The Details list has size, dates and the ID; there are no tabs yet.

**Why.** The design reference shows tag chips, and tags cut across folders.

**Outcome.** A workspace tag vocabulary (name plus a color from a fixed palette), attaching and removing tags (including in bulk), filtering listings and search by tag, and chips in the inspector.

**Acceptance**

- Tag names unique per workspace; normalization decided
- Deleting a tag detaches it everywhere
- Keyboard-friendly tag editor

**Checks:** `postgres`; `contract`; `web`; `rendered`

## ORG-09 Download a folder as ZIP

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: none

**Why.** Getting a whole folder out is basic, and streaming it safely is good backend work.

**Outcome.** Streamed ZIP64 output with bounded memory. The tree is read in a short transaction and streamed afterwards. Names are sanitized, case collisions are detected as domain.md requires, and a size cap applies.

**Acceptance**

- A 2 GB export of 10,000 files stays within a bounded heap (recorded)
- Unicode names round-trip on macOS and Windows unzip
- Digests match; cancelling stops the stream

**Invariants:** INV-07, INV-15  
**Checks:** `backend`; `contract`; `web`

## ORG-10 Duplicate finder

`P2` · `M` · Build · Backend, Web · Public API change · Fun

Depends on: none

**Why.** Filebonsai already stores a SHA-256 for every version, so finding duplicates costs almost nothing.

**Outcome.** (a) A hint at upload time: the web client hashes the file in a worker and asks 'You already have this at Travel/IMG_8421.jpg. Upload anyway?' (b) A Duplicates view that groups identical current versions and shows the bytes you could reclaim. Storage-level dedupe is out of scope.

**Acceptance**

- Hashing never blocks the UI
- Lookups return same-workspace matches only
- The digest index is used

**Invariants:** INV-01  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## ORG-11 Activity and audit log

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: none

**Why.** Audit events are in the domain model, and trash, sharing and Tidy recaps all need them.

**Outcome.** AuditEvent rows written in the same transaction as each mutation (actor, action, target, outcome, correlation ID, time), with no secrets or paths. An Activity tab per entry, a workspace feed, and a retention setting.

**Acceptance**

- Exactly one event per committed effect; idempotent replays add none
- Serialization inspection for INV-11

**Invariants:** INV-11  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## ORG-12 Undo for reversible actions

`P3` · `S` · Build · Web

Depends on: [ORG-02](#org-02-rename), [ORG-03](#org-03-move), [ORG-04](#org-04-trash-and-restore)

**Why.** An undo toast is the calm alternative to confirmation dialogs.

**Outcome.** 'Moved 3 items · Undo' for rename, move, trash and tags within a short window. Undo applies the inverse operation with revision preconditions, so an intervening change makes undo fail clearly rather than overwrite it.

**Acceptance**

- Undo after a conflicting change explains what happened
- Keyboard shortcut plus a screen-reader announcement

**Checks:** `web`; `rendered`

## ORG-13 File notes

`P3` · `S` · Build · Backend, Web · Public API change · Fun

Depends on: none

Context: LIB-06 added the inspector, now in `web/src/routes/library/components/Inspector/`. It is a docked column from 1100px, a modal drawer below that and a bottom sheet on phones. Each row's Details button or the toolbar toggle opens it, and it shows the current folder when nothing is chosen. The Details list has size, dates and the ID; there are no tabs yet.

**Why.** A short note on a file ('the signed copy') is small and useful.

**Outcome.** A plain-text description of up to 2,000 characters per entry, shown and edited in the inspector.

**Acceptance**

- Plain text only, escaped when rendered
- Included in audit events without its content

**Checks:** `postgres`; `contract`; `web`

## ORG-14 Copy files without coupling their lifecycle

`P2` · `L` · Build · Backend, Web · Public API change

Depends on: [ENG-05](foundations.md#eng-05-job-runner-with-a-first-consumer)

**Why.** Copy/paste and “Make a copy” are ordinary drive actions that differ from move, album membership and storage replicas.

**Outcome.** Copy a file to a chosen folder as a new logical entry with independent future versions and annotations. Begin with single files; define a later bounded recursive-folder slice only after this lifecycle is proven. Prefer verified physical copying under existing invariants unless shared immutable object references receive an explicit design decision.

**Acceptance**

- Name reservation, source revision and destination authorization are checked; replay creates one copy.
- Cancelling or restarting a copy never exposes incomplete content, deletes the source or leaves an unowned cleanup obligation.
- Editing, trashing and permanently deleting either entry cannot damage the other.
- The UI distinguishes copy, move and add-to-album, with progress and conflict handling; annotations copied or omitted follow an explicit rule.

**Settle first.** Byte-copy versus safe reference-counted sharing; copy current version only versus history (recommend current only initially); metadata/GPS/share-grant handling.

**Invariants:** INV-01, INV-03, INV-04, INV-05, INV-07, INV-09, INV-10

**Read:** `docs/product/domain.md`, `docs/architecture/storage-and-transfers.md`, `docs/backlog/metadata.md`

**Checks:** `postgres`; `contract`; `web`; `rendered`

## ORG-16 Retry catalog writes that lose a deadlock

`P3` · `S` · Build · Backend

Depends on: none

Context: ORG-03's persistence review: two concurrent moves into one folder whose entries carry crossing names (one moves `x` then `y`, the other `y` then `x`) can deadlock on the sibling-name index. PostgreSQL aborts one with `40P01`, which reaches the client as a `500`. Folder creation has the same exposure. A single-owner workspace rarely hits it.

**Why.** A lost deadlock is a retryable conflict, not a server fault.

**Outcome.** Catalog writes retry a `40P01` (or serialization failure) a bounded number of times within the same idempotency key, or write names in a fixed order so the cycle can't form.

**Acceptance**

- A PostgreSQL test forces the crossing order and both requests finish with per-item results
- Retries never repeat a committed effect

**Invariants:** INV-05, INV-10  
**Checks:** `postgres`

