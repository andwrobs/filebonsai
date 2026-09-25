# 0008: Keep a checked-in candidate backlog

Status: accepted
Date: 2026-09-24

## Context

Decisions 0001 and 0006 make `docs/development/status.md` the single live status and
sequence, and keep speculative task graphs out of `docs/`. As a result, candidate work
beyond the few ordered items lived only in conversations and private tools. Agents
starting from the repository could not see it, and duplicated or missed it.

## Decision

`docs/backlog/` holds a hand-maintained backlog of candidate work: an index plus one
file per epic. Each item states an outcome, acceptance criteria, dependencies, open
questions, the invariants it must evidence, and its checks. It is not an implementation
plan.

- Backlog items are candidates. Their priorities are advisory. `status.md` remains the
  only record of observed state, work in progress, and committed order. An item enters
  `status.md` when work starts.
- A task that finishes an item deletes it from the backlog in the same change that
  records observed results in `status.md`. Git keeps the history. A dependency key that
  no longer appears in the backlog is complete.
- An item removed for any other reason (dropped, split or merged) is removed in the same
  change that updates every item depending on it, so an absent key still means complete.
- Readiness is judged when an item is picked up, from its dependencies and any
  user-held blocker. The backlog is not generated, not a workflow engine, and not a
  store of task packets; those are still written at execution time (decision 0006).
- Work already on an unmerged branch is noted on the item, so a new task starts from
  that branch instead of duplicating it.

## Consequences

- This narrows 0001 and 0006: `docs/backlog/` is the one allowed list of future work in
  `docs/`, and it contains candidates, not ordering or task graphs.
- A private or external copy of the backlog, such as a visual tracker, is a view. The
  checked-in files are authoritative.
- Keeping the backlog current costs a small edit in each task that completes, splits,
  or retires an item.
