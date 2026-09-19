# 0006: Bounded agent work with proportional evidence

Status: accepted
Date: 2026-09-20

## Decision

Use the primary agent to coordinate and integrate ordinary work. Create specialized
builders or read-only reviewers only when a concrete ownership, expertise, or fresh-
context boundary warrants one. Do not maintain a repository-level workflow engine,
graph catalog, task-schema system, permanent coordinator/integrator roles, or duplicate
agent manual.

Before non-trivial changes, state the bounded outcome, owned paths, dependencies,
observable acceptance criteria, and checks. Parallel work requires independent paths
and one writer for shared migrations, public API shape, root build files, and global
design tokens.

Evidence is proportional to the guarantee and tied to the result being handed off.
Record actual commands/results, environment where relevant, limitations, and decision
changes. Checkpoints preserve continuation but never imply completion. Repair observed
failures; two repeats without new evidence trigger diagnosis and replanning.

Material API and persistence/auth/storage/recovery changes receive a fresh read-only
review when the environment supports it. Product runtime behavior never depends on
the agents used to build it.

## Consequences

- Root `AGENTS.md` is the execution contract; `docs/development/status.md` is the only
  live queue/status source.
- Task packets are created at execution time, not stored in a speculative repository
  DAG.
- Specialized `.codex/agents/` profiles remain only where their boundaries are useful.
- UI, database, generated-client, storage, and recovery claims require the checks that
  observe those behaviors; a compile or agent assertion is insufficient.
