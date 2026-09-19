# Testing and evidence

- Java formatting and unit/HTTP tests: `cd backend && ./mvnw test`
- Full contract and client compatibility check: `cd backend && ./scripts/verify.sh`
- PostgreSQL migrations, constraints, ordering, scope, idempotency, rollback, concurrency, and jOOQ schema drift: `cd backend && ./mvnw -Dtest=PostgresCatalogTest test`

UI work requires rendered inspection. Persistence and locking claims require PostgreSQL-backed tests. Generated client or production-readiness claims must cite an observed command and its environment.

## Execution policy

Before running checks, select the smallest matrix that demonstrates the changed
guarantee. A Java-only change needs Java tests; a public HTTP contract change needs
the contract/client check; a PostgreSQL guarantee needs the PostgreSQL test. Do not
run every category by default.

Run ordinary checks while implementing. If the selected matrix contains Docker or
another elevated dependency, issue one final elevated command that combines its
remaining required checks. `verify.sh` covers export, generation, and client checks;
it does not replace Java or PostgreSQL tests, so combine only the additional commands
the task actually needs. Do not request separate elevated approvals for overlapping
focused and integrated runs. A second elevated run is warranted only after a repair
or scope change creates a new claim to verify.

## Feature evidence

- Identity: bad password, rate limit, session rotation, CSRF, logout, restart
  persistence, and administrative reset invalidation.
- Isolation: a second principal attempts list, get, content, complete, cancel, and
  download with the owner's identifiers.
- Catalog: root rules, missing/cross-workspace parents, concurrent normalized-name
  conflicts, Unicode, and byte limits.
- Transfers: normal and zero-byte bodies, whole-body replay, wrong length/digest,
  configured limits, and active-writer collision.
- Recovery: interruption during body, promotion, and catalog commit; repeated complete;
  expiry; and restart reconciliation.
- Filesystem: traversal, symlink escape, restricted data root, and cleanup that cannot
  delete valid or uncertain content.
- UI: honest progress/pending state, retry explanation, keyboard/focus behavior, long
  names, many items, and small viewports.
- Deployment: fresh install, restart persistence, schema upgrade, non-root process,
  export, and restore when those guarantees exist.

Use synthetic fixtures and record their digests. Fault injection should surround state
transitions, not only mocks. A local emulator is not evidence of provider compatibility.
Do not place credentials, personal files, signed URLs, or internal paths in fixtures or
evidence.
