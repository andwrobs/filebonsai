# Codex profiles

Root `AGENTS.md` is the execution contract. These profiles exist only for useful
specialization boundaries:

- `backend_builder.toml`: bounded Java/Spring/PostgreSQL capability work;
- `frontend_builder.toml`: bounded React or Swift client work;
- `contract_reviewer.toml`: read-only Java-to-OpenAPI/client compatibility review;
- `persistence_reviewer.toml`: read-only database/storage/transaction review;
- `reviewer.toml`: read-only general correctness review.

The primary agent coordinates, designs, integrates, updates status, and owns the final
handoff unless a task explicitly delegates a non-overlapping slice. Profiles never
invent readiness, expand authorization, or substitute an old check for current evidence.
They inherit the root rules to keep updates concise, select a proportional test matrix,
and batch elevated verification instead of requesting redundant approvals.
