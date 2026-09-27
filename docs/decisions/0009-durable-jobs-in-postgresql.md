# 0009: Durable jobs use a fenced PostgreSQL job table

Status: proposed
Date: 2026-09-27

## Context

Photo metadata, thumbnails, purge, re-tiering, scrubbing and export all need work that
outlives the request that caused it. Today the only background work is two
`@Scheduled` loops for R2 recovery and orphan cleanup. Upload cancellation commits
`CANCELLED` and then deletes the staged body with no durable record of that obligation,
so a crash or failed delete in between leaves orphaned bytes that nothing revisits.

Any job mechanism must satisfy INV-07 (no transaction spans handler I/O), INV-09 (a
stale worker cannot publish over a newer attempt) and INV-10 (retry or restart neither
loses intent nor multiplies committed effects).

## Options considered

| | Custom table with `SKIP LOCKED` | db-scheduler 16.11 | JobRunr (open source) |
| --- | --- | --- | --- |
| License | Ours | Apache-2.0 | LGPL-3.0; transactions, rate limits and mutexes are paid Pro features |
| INV-07 | Claim and completion are short transactions; the handler runs between them | Executes outside transactions | Executes outside transactions |
| INV-09 | A fence increments on every claim; the handler's own write commits with completion only when its fence still matches | Heartbeat-based dead-execution detection can re-run a task while the first run continues; a version column rejects the stale completion, but handlers get no fence to guard their own writes | Handlers get no fence; same gap |
| INV-10 | The job row is inserted in the state change's transaction; a partial unique key deduplicates | Possible through `TransactionAwareDataSourceProxy`, unproven with jOOQ's Spring transactions; task instance IDs deduplicate | Enqueue inside a transaction needs Pro |
| Workspace scope | A column, checked by handlers | Encoded in the task instance string | Inside the serialized job |
| Dead letters | An explicit `DEAD` state | Left to a failure handler | Failed state in its dashboard |
| Added surface | None | Its own table, poller and heartbeat threads | A background server and a dashboard HTTP port |

The fence is the deciding requirement. Filebonsai's effects (publishing metadata,
writing derived assets, deleting staged bytes) must be rejected when a newer claim
exists, and the upload code already implements that pattern with `fence` and
`recovery_claim_id`. Neither library exposes a claim token to the handler, so either
would still need a Filebonsai fence table beside it.

## Decision

Build a small runner on one PostgreSQL table. ENG-05's migration owns the exact schema;
the shape is:

`jobs(id, workspace_id nullable, kind, subject_id nullable, dedupe_key, state, attempts,
max_attempts, run_after, lease_owner, lease_expires_at, fence, last_error_code,
created_at, updated_at, finished_at)`, with states `PENDING`, `RUNNING`, `SUCCEEDED`
and `DEAD`.

- **Enqueue.** A job is inserted in the same transaction as the state change that
  creates the obligation. Because the queue lives in the same database, the job row is
  the transactional outbox: there is no relay or second store. If an external broker
  ever appears, a job kind feeds it.
- **Deduplicate.** `(kind, dedupe_key)` is unique while a job is `PENDING`, `RUNNING` or
  `DEAD`, so a sweeper cannot silently recreate a dead obligation; requeueing or
  discarding it is an operator action. Keys name the obligation, for example
  `metadata:<versionId>:v3`. Enqueue is an insert that does nothing on conflict.
- **Claim.** One short transaction selects due `PENDING` jobs, and `RUNNING` jobs whose
  lease expired, with `FOR UPDATE SKIP LOCKED`. It increments `fence` and `attempts`
  and sets the lease.
- **Run.** The handler runs with no transaction open. It receives the job ID, fence,
  workspace and subject ID, not a payload blob, and reloads its subject through
  workspace-scoped queries. It extends its lease by heartbeat. A heartbeat rejected for
  a stale fence tells it to stop.
- **Complete.** The handler's database effect and the job's completion commit in one
  transaction that first checks the fence. A stale worker's commit changes nothing.
  Effects outside PostgreSQL must be idempotent or written under keys the job owns, and
  they become visible only through that fenced commit, as the transfer code already
  requires.
- **Fail.** A retryable failure returns the job to `PENDING` with exponential backoff and
  jitter, up to a cap. A permanent failure, or the last allowed attempt, moves it to
  `DEAD` with a short error code. Exception text, paths and keys are never stored
  (INV-11). Content outcomes such as an unsupported or malformed file are successful
  jobs that record the outcome on their subject, not failures.
- **Crash.** An expired lease is claimed again with a new fence. Attempts still count,
  so a job that repeatedly kills its worker ends `DEAD` instead of looping.
- **Budgets.** Each kind registers its concurrency, lease length, timeout and maximum
  attempts. A worker claims only kinds with a free slot, so a slow kind cannot starve
  the others.
- **Periodic work.** A scheduler tick enqueues periodic kinds with a dedupe key for the
  period, so several backend processes still enqueue once. The existing R2 loops may
  move over later; nothing requires it.
- **Shutdown.** The runner stops claiming, gives running handlers a grace period, then
  releases their leases with a fence increment so the next claimant starts cleanly.
- **Retention and visibility.** A periodic kind deletes `SUCCEEDED` rows after a
  retention period. `DEAD` rows stay until an operator requeues or discards them. Logs
  carry job ID, kind, attempt and outcome code. Metrics wait for ENG-09.
- **Wake-up.** Workers poll with a short interval while busy and back off when idle.
  `LISTEN/NOTIFY` can reduce latency later without changing these semantics.
- **Placement.** The runner (table access, claim loop, registry) lives in
  `platform/jobs` because it is cross-capability. Handlers live with the capability
  that owns their effect: Transfers owns staged-body cleanup and Processing owns media
  work.

The runner deliberately has no cron expressions, dashboard, priorities or distributed
rate limits. If those become necessary, reconsider db-scheduler before growing it.

### First consumer

ENG-05's first consumer discards the staged body of a cancelled or expired upload. The
job is enqueued in the transaction that makes the session terminal, so the obligation
survives a crash. It exercises the outbox, an idempotent effect (delete-if-exists of a
key the session owned), fencing and takeover, with an effect that is easy to observe.
Photo metadata extraction (PRV-04) is the first product consumer.

## Consequences

Migration obligations for ENG-05:

- One Flyway migration adds `jobs` with check constraints on state, attempts and fence,
  the partial unique dedupe index, and a claim index on state and `run_after`.
- `workspace_id` references `workspaces` and is null only for system kinds.
- The generated jOOQ schema is regenerated. Existing tables change only where the first
  consumer needs them.

Test obligations, all PostgreSQL-backed:

- Lease-expiry takeover increments the fence. The stale worker's heartbeat and
  completion are then rejected.
- Two workers forced onto the same job produce one effect.
- A worker abandoned between claim and completion leaves a job that is reclaimed and
  completed once.
- An enqueue rolls back with its state change. Concurrent duplicate enqueues create one
  job.
- Backoff is applied, and a job that always fails or always crashes ends `DEAD`.
- A handler blocked on I/O holds no connection; a query succeeds on the pool's only
  connection meanwhile, as the R2 resource test already checks.
- Graceful shutdown releases leases.
- A handler never loads a subject from another workspace.

## References

- [db-scheduler README: polling strategies, dead executions, transactions](https://github.com/kagkarlsson/db-scheduler) (read 2026-09-27)
- [JobRunr open-source and Pro features](https://www.jobrunr.io/en/pricing/) (read 2026-09-27)
- [PostgreSQL row locking with `SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
