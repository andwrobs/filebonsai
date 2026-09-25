# Organize

Rename, move, trash, versions and tags. Every change is metadata, reversible where possible, and audited.

These are the M3 features. They share one set of rules for concurrency, idempotency, bulk results and name reservation, so the first item is a decision that settles those rules once. After that, rename and move are metadata only. Trash is reversible. Deleting bytes happens only through a crash-safe job.

See [the backlog index](README.md) for how to pick up and retire items.

## ORG-01 Decision: how entries change

`P1` · `S` · Decision · Backend, Docs

Depends on: none

**Why.** Rename, move, trash and versions all change the catalog and should share one set of rules.

**Outcome.** A decision record plus domain.md and catalog.md updates covering optimistic concurrency (entry revision via If-Match or a body field), mutation idempotency, bulk semantics (all-or-nothing vs per-item results), whether trashed entries keep their names, trashing a folder as a single unit, restoring when the parent is gone, trash retention, and audit.

**Acceptance**

- Recommends one option for each question, with its tradeoff
- Lists the invariants each operation must prove

**Settle first**

- Recommendation: a trashed entry leaves the namespace, and restoring into a name conflict asks for a new name

**Read:** `docs/product/domain.md`, `docs/product/catalog.md`, `docs/api/conventions.md`  
**Checks:** `decision-review`

## ORG-02 Rename

`P1` · `M` · Build · Backend, Web · Public API change

Depends on: [ORG-01](#org-01-decision-how-entries-change)

**Why.** This is the first metadata mutation and sets the pattern for the rest.

**Outcome.** A rename endpoint with a revision precondition and idempotent replay, returning NAME_CONFLICT on collision; the root can't be renamed. Inline rename in the web client (F2 or Enter to start, Esc to cancel) from the list and the inspector.

**Acceptance**

- Of two concurrent renames, one wins and the other gets the conflict code chosen in ORG-01
- A pending upload's reservation causes a conflict
- Unicode and 255-byte names; another workspace's entry returns 404
- Physical storage untouched

**Invariants:** INV-01, INV-02, INV-05, INV-08  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## ORG-03 Move

`P1` · `L` · Build · Backend, Web · Public API change

Depends on: [ORG-01](#org-01-decision-how-entries-change), [LIB-05](everyday-library.md#lib-05-selection-model)

**Why.** Reorganizing a library means moving things, sometimes many at once.

**Outcome.** Move one or more entries into a folder, rejecting cycles and reporting name conflicts per item. A 'Move to…' dialog with a folder picker (the non-drag path), plus dragging onto the tree.

**Acceptance**

- Two concurrent opposing moves (A into B, B into A) can't create a cycle (PostgreSQL test)
- Moving the root is rejected
- Bulk results follow ORG-01
- Physical storage untouched

**Invariants:** INV-01, INV-02, INV-08  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## ORG-04 Trash and restore

`P1` · `L` · Build · Backend, Web · Public API change

Depends on: [ORG-01](#org-01-decision-how-entries-change)

**Why.** Deleting must be reversible before anything is deleted permanently.

**Outcome.** Soft delete, where a folder's whole subtree is trashed as one item. A Trash view shows the original location and deletion time. Restore goes to the original parent or a chosen folder, with a conflict flow. Trashed files can't be listed, searched or downloaded.

**Acceptance**

- PostgreSQL tests for trashing and restoring subtrees, name release per ORG-01, and authorization
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

Depends on: [ORG-01](#org-01-decision-how-entries-change)

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

Depends on: [ORG-06](#org-06-upload-a-new-version-of-a-file), [LIB-06](everyday-library.md#lib-06-inspector-panel)

**Why.** Immutable versions are a core promise, and users should be able to see them.

**Outcome.** List versions (ordinal, size, SHA-256, created, author), download any version, and restore one by making it current again (a pointer move or a copy, as decided). A Versions tab in the inspector.

**Acceptance**

- Version reads follow source authorization (INV-12)
- Restoring is idempotent and audited

**Invariants:** INV-12  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## ORG-08 Tags

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: [LIB-06](everyday-library.md#lib-06-inspector-panel)

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

Depends on: [ORG-01](#org-01-decision-how-entries-change)

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

Depends on: [LIB-06](everyday-library.md#lib-06-inspector-panel)

**Why.** A short note on a file ('the signed copy') is small and useful.

**Outcome.** A plain-text description of up to 2,000 characters per entry, shown and edited in the inspector.

**Acceptance**

- Plain text only, escaped when rendered
- Included in audit events without its content

**Checks:** `postgres`; `contract`; `web`
