# Repository scripts

Root scripts are small commands that compose existing tools across modules. Backend-specific contract and client checks remain in `backend/scripts/` until a root workflow needs to orchestrate more than one application.

- `sync-claude-agents`: regenerates `.claude/agents/` from `.codex/agents/*.toml`. Pass `--check` to fail on stale or orphaned output without writing.
