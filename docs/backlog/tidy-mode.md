# Tidy mode

Swipe through files one card at a time and decide what stays, what gets archived and what goes. Decisions are staged, reviewed and reversible.

Libraries decay slowly: screenshots, downloads, duplicates and big files nobody has opened in years. Table views ask you to decide in bulk without looking. Tidy shows one file at a time, preview first, and tallies the space and cost impact as you go. Swipes are shortcuts; every card also has buttons and keys. Nothing applies until you review the batch. There are no streaks and no guilt. Tidy is also the friendly front door to tiered storage: 'archive' starts as a logical state and later moves bytes to a colder tier.

See [the backlog index](README.md) for how to pick up and retire items.

## TDY-01 Decision: Tidy mode interaction spec

`P1` · `M` · Decision · Web, Docs · Fun

Depends on: none

**Why.** Tidy is the fun, differentiating way into archiving. Its rules should be settled before any code.

**Outcome.** A decision record plus an interaction spec and a lo-fi prototype page. They define what Archive means before tiers exist (a logical state: hidden from default browsing but still searchable, downloadable and eligible for cold placement later). They also define gestures and their key and button equivalents (← archive, → keep, ↓ trash, ↑ move, space to preview, Z to undo), the staged batch with review and apply steps, undo, the decks, the tone (no streaks, no guilt), and accessibility and reduced-motion rules.

**Acceptance**

- Every gesture has a non-drag equivalent
- Nothing applies without review
- Decks defined with their ranking signals

**Read:** `docs/product/design.md`, `docs/product/overview.md`  
**Checks:** `decision-review`

## TDY-02 Archived state and Archive view

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: [TDY-01](#tdy-01-decision-tidy-mode-interaction-spec), [ORG-01](organize.md#org-01-decision-how-entries-change)

**Why.** Archive needs a meaning before any tier exists, and the sidebar already shows it.

**Outcome.** A logical archived flag, an Archive view, and unarchive. Default browsing hides archived items behind an 'n archived' link. Bytes don't move yet; TIER-06 adds placement later.

**Acceptance**

- Archived items stay downloadable and searchable (with a filter)
- Folder archive semantics as decided

**Checks:** `postgres`; `contract`; `web`; `rendered`

## TDY-03 Access recency signal

`P2` · `S` · Build · Backend

Depends on: none

**Why.** 'Untouched for two years' needs a last-opened time that doesn't cost a database write on every download.

**Outcome.** Record a coarse last-opened date per entry (from download or preview), updated at most once per entry per day.

**Acceptance**

- At most one write per entry per day under load
- Not exposed beyond the owner's own views

**Checks:** `postgres`

## TDY-04 Tidy deck candidates API

`P2` · `M` · Build · Backend · Public API change

Depends on: [TDY-01](#tdy-01-decision-tidy-mode-interaction-spec), [TDY-03](#tdy-03-access-recency-signal)

**Why.** Tidy is only as good as the cards it offers.

**Outcome.** Deck endpoints return ranked candidates with reason chips ('312 MB · untouched 2 yrs · 3 copies'). Decks: Big & old, Duplicates, Unsorted (root or Inbox), Screenshots & downloads (name heuristics), Rediscover (random older photos), and a custom folder or saved search.

**Acceptance**

- Excludes pending, trashed and already-decided entries
- Cursor-paginated and workspace-scoped
- Ranking is deterministic for a seed

**Invariants:** INV-01  
**Checks:** `postgres`; `contract`

## TDY-05 Tidy decision batches

`P2` · `M` · Build · Backend · Public API change

Depends on: [TDY-02](#tdy-02-archived-state-and-archive-view), [ORG-03](organize.md#org-03-move), [ORG-04](organize.md#org-04-trash-and-restore)

**Why.** Swipes stage decisions; applying them has to be safe, idempotent and reversible.

**Outcome.** A durable batch of staged decisions (keep, star, archive, trash, move, skip) with an idempotency key. It previews totals (files, bytes, and the monthly estimate change once COST-04 exists), applies with per-item results, emits audit events, and supports undo as an inverse batch where possible.

**Acceptance**

- Replaying an apply changes nothing
- A partial failure reports each item
- Undo respects revisions

**Invariants:** INV-05, INV-10  
**Checks:** `postgres`; `contract`

## TDY-06 Swipe deck UI

`P2` · `L` · Build · Web · Fun

Depends on: [TDY-04](#tdy-04-tidy-deck-candidates-api), [TDY-05](#tdy-05-tidy-decision-batches)

**Why.** This is the centrepiece: fast on a phone and even faster with a keyboard.

**Outcome.** A card stack with a preview (thumbnail or type art), pointer-event swiping with a velocity threshold and spring-back, key and button equivalents, and a reduced-motion variant (cross-fade, no fling). Progress ('12 of 40'), a running tally ('Archive 8 · 1.2 GB'), then review, apply and an undo toast.

**Acceptance**

- Works at 390px with one thumb
- Every action is reachable without dragging
- No animation under reduced motion

**Checks:** `web`; `rendered`

## TDY-07 Sort-into-folders mode

`P3` · `M` · Build · Web · Fun

Depends on: [TDY-06](#tdy-06-swipe-deck-ui), [ORG-03](organize.md#org-03-move)

**Why.** Inbox zero for files.

**Outcome.** Pick up to four destination folders as swipe or key targets, plus an 'Other…' picker, to file an Inbox quickly. Targets are remembered per deck.

**Acceptance**

- Destinations shown on screen, not just as gestures
- A move conflict shows a rename prompt inline

**Checks:** `web`; `rendered`

## TDY-08 Duplicate resolution card

`P3` · `S` · Build · Web

Depends on: [TDY-06](#tdy-06-swipe-deck-ui), [ORG-10](organize.md#org-10-duplicate-finder)

**Why.** Duplicates need a different card: pick which copy to keep.

**Outcome.** One card per duplicate group showing each copy's path and date. You choose the keeper (default: the oldest copy outside the Inbox), and the rest are staged to trash.

**Acceptance**

- Never stages every copy of a group to trash
- Keyboard selection of the keeper

**Checks:** `web`; `rendered`

## TDY-09 Tidy recap

`P3` · `S` · Build · Web, Backend · Fun

Depends on: [ORG-11](organize.md#org-11-activity-and-audit-log), [TDY-05](#tdy-05-tidy-decision-batches)

**Why.** A little satisfaction without gamification.

**Outcome.** A weekly recap built from audit events: files sorted, bytes archived or freed, and trash about to expire.

**Acceptance**

- No streaks, badges or guilt copy
- Hidden when empty

**Checks:** `web`; `rendered`
