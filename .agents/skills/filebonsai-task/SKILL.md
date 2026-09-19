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

1. Inspect the current implementation and reproduce the relevant baseline.
2. Implement the smallest coherent slice.
3. Select the smallest check matrix for the changed guarantee. Run ordinary
   in-sandbox checks while implementing; batch every remaining elevated check into one
   final request. Do not duplicate focused and integrated runs just to collect evidence.
4. Repair concrete failures. After two identical failures without new evidence, return
   to diagnosis and revise the approach.
5. Run the integrated check that covers the changed guarantee.
6. For material API or persistence/auth/storage/recovery work, request the matching
   read-only reviewer when available.
7. Update `docs/development/status.md` only when verified state or ordering changed.

The final handoff names changed files, actual commands/results, unresolved limitations,
and decision updates. Compilation alone is not evidence for HTTP shape, PostgreSQL
behavior, generated-client compatibility, storage recovery, or rendered UI behavior.
