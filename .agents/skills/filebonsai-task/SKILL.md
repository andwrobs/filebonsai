---
name: filebonsai-task
description: Execute a bounded Filebonsai implementation, refactor, or repair with explicit acceptance criteria, proportional verification, and a durable handoff. Do not use for simple questions or broad roadmap discussion.
---

# Filebonsai task workflow

Read root `AGENTS.md`, `docs/README.md`, `docs/development/status.md`, and only the
active product/architecture/API standards relevant to the requested slice.

Before editing, state the outcome, owned paths, dependencies, observable acceptance
criteria, and checks. Resolve a material convention or contract decision before broad
implementation. Do not invent a persistent task graph or copy status into another file.
When the task is a backlog item, follow `docs/backlog/README.md` to pick it up and retire it.

1. Inspect the current implementation and reproduce the relevant baseline.
2. Implement the smallest coherent slice.
3. Select the smallest check matrix for the changed guarantee. Run ordinary
   in-sandbox checks while implementing; batch every remaining elevated check into one
   final request. Do not duplicate focused and integrated runs just to collect evidence.
4. For material API or persistence/auth/storage/recovery work, request the matching
   fresh-context read-only reviewer after focused checks and before final integrated
   verification. Send only the acceptance criteria, changed paths, diff base, relevant
   standards, and existing evidence; do not pass the full conversation history.
5. Repair concrete failures and review findings that violate acceptance criteria,
   security invariants, or data correctness. Record other review improvements as
   follow-up rather than expanding the active task automatically. After two identical
   failures without new evidence, return to diagnosis and revise the approach.
6. Run one integrated check that covers the changed guarantee. Before a second
   integrated run, or when changed paths or acceptance criteria materially expand,
   pause and report the added cost and scope.
7. Update `docs/development/status.md` only when verified state or ordering changed.
   Delete a finished backlog item in the same change.
8. Deliver on a `<agent>/<short-slug>` branch from current `main`, in its own worktree.
   Commit only the owned paths, push, and open or update the pull request with the
   `filebonsai-pr` skill. Do not commit to `main` or merge without an explicit request.

Bound routine command output and inspect targeted failure reports instead of importing
full build, generator, or container logs. Do not reread unchanged material already in
the task context. Prefer a fresh task for a new bounded slice after a long implementation
or review cycle.

The final handoff names changed files, actual commands/results, unresolved limitations,
and decision updates. Compilation alone is not evidence for HTTP shape, PostgreSQL
behavior, generated-client compatibility, storage recovery, or rendered UI behavior.
