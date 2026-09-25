# 0001: Repository and documentation shape

Status: accepted
Date: 2026-09-20

## Decision

Use the repository root as the monorepo root. Keep `backend/` as the independently
buildable Java modular monolith, with `web/` and `ios/` as sibling application roots.
Do not add a root Maven aggregator while only one Java module exists.

`docs/` contains only active product, architecture, API, decision, and development
truth. `docs/README.md` indexes it, and `docs/development/status.md` is the single live
status/sequence. Superseded handoffs, alternate specifications, generated task graphs,
and archival copies belong in Git history rather than a browsable reference tree. The
hand-maintained candidate backlog in `docs/backlog/` is the one exception
([0008](0008-checked-in-backlog.md)).

Agent execution authority lives in root `AGENTS.md`. Repository skills add bounded
task procedures; specialized Codex profiles add role focus. They do not replicate
product truth or form a custom orchestration service.

## Consequences

- CI and commands name `backend/` explicitly.
- Generated jOOQ and API-client code stays disposable and module-owned.
- Agents can determine active guidance from the filesystem without precedence rules
  for archived documents.
- A removed historical detail must be deliberately restored to an active document if
  it becomes relevant; it is never cited from an archive as current authority.
