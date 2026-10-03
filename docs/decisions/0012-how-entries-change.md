# 0012: How entries change

Status: accepted
Date: 2026-10-03

## Context

Until now, nothing changes an entry once it exists: folders are created and uploads
publish new files. Rename (ORG-02), move (ORG-03), trash and restore (ORG-04), new
versions (ORG-06), undo (ORG-12) and audit (ORG-11) will all change existing entries.
They are driven from menus, dialogs, keyboard commands and drags (LIB-22), often on a
multi-selection, by clients that can lose a response and retry. They need one set of
rules, settled before the first of them is built.

Today's schema shapes the options:

- `catalog_entries` holds identity, kind, times and the current-version pointer. Name
  and parent live on the entry's `catalog_names` claim, which shares the sibling
  namespace with pending upload reservations through one unique index.
- V9 triggers copy each entry's kind, `updated_at` and current size onto its name row.
  The copy trigger reads the entry without a lock, and an entry update locks the entry
  and then its name row. The 2026-09-27 persistence review recorded both.
- `idempotency_records` stores one `response_entry_id` per key for 30 days.
- `getEntry` reads a folder, then its `ancestors` in a second statement. With moves,
  the two can disagree.
- Folder creation has no depth limit; the ancestor query stops at 1024 levels.

## Decision

### Revisions and preconditions

Every entry gets a `revision`, a positive integer that starts at 1 and increases by one
whenever its name, parent, trash state or current version changes. Annotations such as
tags and notes don't change it, so tagging never conflicts with a rename. A folder's
revision doesn't change when its children change, so two drops into one folder never
conflict. Every entry response carries `revision`.

Each mutation names the revision the client saw in the request body, as
`expectedRevision` on each item. A mismatch is `REVISION_CONFLICT` (`409` for a
single-entry operation, a per-item result in a bulk one). We use a body field rather
than `If-Match` because a bulk request needs one precondition per item, and one style
for every operation is simpler for generated clients. The tradeoff: no HTTP-level
conditional requests or ETags; we don't need them for private, `no-store` metadata.

`expectedRevision` is required. It is the second line of defense against a repeated
command (see below).

### Idempotency

Every mutation requires a UUID `Idempotency-Key`, scoped by principal, workspace and
operation, exactly as for folder creation. The intent hash covers the normalized
request: items sorted by entry ID, with their expected revisions, the destination and
any new name. Replaying the key with the same intent returns the stored original result,
not a recomputation against the current state, and changes nothing. Reusing it with
another intent is `409 IDEMPOTENCY_CONFLICT`.

A client creates the key when the user commits the action (confirms a dialog, drops,
presses Enter), keeps it until it gets a result, and sends it on every retry. Two
gestures are two keys.

Records keep the full result: `idempotency_records` gains a nullable JSON result for
operations whose result is not one entry, holding entry IDs, outcome codes, revisions
and previous parents, never names or paths. Retention stays 30 days. After it lapses,
a replay runs again, and the revision preconditions make it fail safely: an entry that
already moved has a newer revision. A second key with the same intent (a double click)
fails the same way, or finds the entry already in place.

### Bulk operations

Bulk operations (move, trash, restore, later tags) report per item and allow partial
success. One request is one transaction: every item is checked under lock, the items
that pass are applied together, and the response lists one result per requested item.
A uniqueness violation for one item rolls back to that item's savepoint and becomes its
`NAME_CONFLICT`, so it can't abort the others.

The response is `200` with `items`, even when some or all items fail. Request-level
problems keep their usual status and change nothing: validation `400` (including an
empty list, duplicate IDs or more than 1,000 items), a missing or inaccessible
destination `404 ENTRY_NOT_FOUND`, a file destination `400 NOT_A_FOLDER`, and
`409 IDEMPOTENCY_CONFLICT`.

We chose this over all-or-nothing. Dropping 50 files where one name collides should
move 49 and say which one didn't. All-or-nothing would make the user resolve the one
conflict before anything happens, which most file managers don't do. The cost is a
richer result shape and an undo (ORG-12) that inverts only the items that changed.

Each item result has `entryId`, `outcome`, the entry's resulting `revision`, and, for a
changed item, `previousParentId`, which the client uses to refresh listings and to undo.
The move outcomes are:

| Outcome | Meaning |
| --- | --- |
| `MOVED` | The entry now sits in the destination. |
| `MOVED_WITH_ANCESTOR` | A selected ancestor moved, carrying this entry inside it. |
| `UNCHANGED` | The entry was already in the destination. No revision change. |
| `ANCESTOR_NOT_MOVED` | A selected ancestor failed, so this entry stayed where it was. |
| `NOT_FOUND` | Missing, inaccessible, pending or trashed; indistinguishable. |
| `REVISION_CONFLICT` | The entry changed since the client read it. |
| `NAME_CONFLICT` | An entry or pending upload in the destination holds the name. |
| `CANNOT_MOVE_ROOT` | The workspace root never moves. |
| `DESTINATION_INSIDE_ENTRY` | The destination is the folder itself or inside it. |
| `DEPTH_LIMIT_EXCEEDED` | The move would put a folder deeper than the folder depth limit. |

Other bulk operations define their own outcome lists on the same pattern.

### Selections that contain a folder and its descendants

The server normalizes the selection at execution time, under lock, because only it
knows the current hierarchy. An item with a selected ancestor in the same request is
never moved by itself: it is reported as `MOVED_WITH_ANCESTOR` or `ANCESTOR_NOT_MOVED`
from its closest selected ancestor's result, and its own revision is not checked because
its row doesn't change. The client therefore knows where every requested entry is
without another read.

Items are evaluated in entry-ID order, so the same selection always gets the same
results. If two selected entries from different folders share a name, the one with the
lower ID moves and the other gets `NAME_CONFLICT`.

### Lost responses, stale entries and stale destinations

- **Lost response.** The retry with the same key returns the stored result. Nothing
  moves twice.
- **Stale entry.** `REVISION_CONFLICT` for that item; the rest proceed.
- **Stale destination.** The destination is named by ID, so if it was renamed or moved
  since the client listed it, the move still lands in that folder wherever it now is.
  If it no longer exists or is trashed, the whole request is `404` and nothing moves.
  The destination's revision is not checked.
- **Move into the current parent.** `UNCHANGED`, with no revision bump and no audit
  event.

### Locking

All catalog writers follow one lock order:

1. A per-workspace hierarchy lock, `pg_advisory_xact_lock` on a workspace-scoped key.
   Operations that change where a folder is or whether it is visible (moving, trashing
   or restoring a folder) take it exclusively. Folder creation, begin-upload and file
   moves take it shared, so they can't add a child to a folder that is being moved or
   trashed. Renames don't take it.
2. The affected entry rows, `FOR UPDATE`, in ascending UUID order.
3. Their name rows, then any destination name claims.

The exclusive lock makes cycle and depth checks reliable. Concurrently, "A into B" and
"B into A" each check that the destination isn't inside the moved folder. Under
`READ COMMITTED`, both checks can pass and commit a cycle. With the lock, the second
sees the first's result. The shared lock lets folder creations run in parallel while
keeping a concurrent move from deepening a subtree past the limit. A Filebonsai
workspace has one owner, so serializing folder moves per workspace costs nothing a user
would notice. Row-level ancestor locking would scale further, but it is harder to make
free of deadlocks.

The V9 copy trigger also reads its entry `FOR SHARE` in its own statement, so a name
write that doesn't follow the order waits for an uncommitted entry change instead of
copying stale values.

### Folder depth

A folder sits at most 1,024 levels below the root, which is at depth 0. That is the
ancestor query's existing cap, so every valid folder reads its full path. Creating a
folder below that depth is `409 DEPTH_LIMIT_EXCEEDED`. A move checks the moved folder's
deepest subfolder against the destination's depth under the exclusive lock.

### Reads after a move

A folder read takes its row and its `ancestors` from one snapshot: one recursive query
that also returns the folder, or a read-only `REPEATABLE READ` transaction. The
folder's `parentId` always equals the last ancestor's ID. Listings stay keyset pages
without a snapshot, as today.

### Trash

- **Namespace.** A trashed entry leaves its parent's namespace, so its name is free
  for a new file. The trash keeps its original parent and name. Restoring into a taken
  name returns `NAME_CONFLICT` for that item, and the client asks for a new name and
  resubmits with it.
- **One unit.** Trashing a folder trashes its subtree as one trash item. Its
  descendants keep their names inside it, become unreachable by ID, and return with it.
  They can't be restored one by one. The mechanism (ORG-04) must let a single read
  decide visibility without walking unbounded ancestry.
- **Restore when the parent is gone.** If the original parent is trashed or deleted,
  the item fails with `ORIGINAL_LOCATION_UNAVAILABLE`, and the client offers a folder
  picker that defaults to the Library root. Filebonsai doesn't recreate missing folders.
- **Retention.** Trashed items are purged 30 days after trashing by default; the
  deployment can configure this. ORG-05's job deletes them. Until it exists, nothing is
  purged.

### Audit

Each committed change writes one `AuditEvent` per changed entry in the same
transaction, sharing a correlation ID per request. `UNCHANGED`, failed items and
replays write none. Events carry IDs and outcome codes, never names, paths or keys.
ORG-11 adds the table and the events. Mutations built before it must keep their changes
in one transaction so it can add the insert without restructuring them.

### Invariants each operation must prove

| Operation | Must prove |
| --- | --- |
| Rename | INV-01, INV-05, INV-08 (atomic name claim against entries and pending uploads), revision conflict, root rejected, storage untouched (INV-02) |
| Move | INV-01 for entries and destination, INV-05, INV-08 including concurrent opposing moves, depth limit, per-item partial results, replay without a second move, storage and versions untouched (INV-02, INV-03) |
| Trash and restore | INV-01, INV-05, namespace release and restore conflicts, subtree as one unit, trashed content unreachable for listing, download and upload |
| New version | INV-03, INV-04, INV-10, revision change only at publication |
| All | One lock order; `parentId` and `ancestors` agree; per-item audit events once ORG-11 lands |

## Consequences

- Entries gain a `revision` column and every entry response a `revision` field. It is a
  new required response field, which existing generated clients decode compatibly.
- Bulk results need stored JSON results in `idempotency_records`. Its
  `response_entry_id` becomes nullable, and a check requires exactly one of the two.
- The V9 copy trigger changes to read `FOR SHARE`, and folder creation, begin-upload and
  file moves take the shared hierarchy lock, in the first build item that changes
  entries.
- Moves, trash and restore have one request shape and one result shape that the dialog,
  menus, keyboard and drag targets all use.
- Partial success means clients must show mixed results and refresh by
  `previousParentId` and destination, not assume all or nothing.
