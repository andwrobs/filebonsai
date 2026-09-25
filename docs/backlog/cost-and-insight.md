# Cost & insight

Show where the bytes are and roughly what they cost, with dated sources. These are estimates, not invoices.

The design reference already shows 'Estimate: $2.11/mo' in the sidebar. Keep it light and honest: price sheets carry a source and a date, assumptions are visible, and nothing looks like billing. Folder-size rollups also power the space map, which is fun on its own.

See [the backlog index](README.md) for how to pick up and retire items.

## COST-01 Usage rollups

`P2` · `M` · Build · Backend · Public API change

Depends on: none

**Why.** Space maps, estimates and Tidy tallies all need folder sizes.

**Outcome.** Bytes and file counts per folder (recursive), per connection or tier, and per type, with an API for a folder's usage.

**Acceptance**

- Totals match a brute-force recount in tests
- Stays correct under concurrent uploads, moves and trash

**Settle first**

- Rollups maintained in the publishing transaction vs an on-demand recursive CTE with caching

**Checks:** `postgres`; `contract`

## COST-02 Space map

`P2` · `M` · Build · Web · Fun

Depends on: [COST-01](#cost-01-usage-rollups)

**Why.** A treemap of your library is informative and fun.

**Outcome.** An interactive treemap or sunburst of folder sizes (DaisyDisk style): click to drill in, breadcrumbs, color by type or tier, and a table alternative for screen readers.

**Acceptance**

- Labels never overlap; small items are grouped
- Keyboard drill-down

**Checks:** `web`; `rendered`

## COST-03 Decision: cost estimate model

`P2` · `S` · Decision · Docs, Backend

Depends on: none

**Why.** Estimates must be honest: dated, sourced, and clearly not billing.

**Outcome.** Price sheets as versioned data (source URL, retrieval date, units: GB-month, class A and B operations, retrieval, egress, minimum duration), operator overrides, and 'Estimate, prices as of <date>' labelling.

**Acceptance**

- Nothing looks like an invoice (per principles.md)
- Update process for stale prices

**Read:** `docs/development/principles.md`  
**Checks:** `decision-review`

## COST-04 Monthly estimate on the Storage page

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: [COST-01](#cost-01-usage-rollups), [COST-03](#cost-03-decision-cost-estimate-model), [M1-09](finish-m1.md#m1-09-read-only-storage-page)

**Why.** The design reference shows '128 GB of 1 TB · Estimate: $2.11/mo'.

**Outcome.** Per-connection and per-tier estimates on the Storage page and in the sidebar footer, with assumptions a click away.

**Acceptance**

- Every estimate shows its price date
- Hidden when there's no price data

**Checks:** `contract`; `web`; `rendered`

## COST-05 What-if preview

`P3` · `S` · Build · Web, Backend

Depends on: [COST-04](#cost-04-monthly-estimate-on-the-storage-page), [TIER-01](storage-tiers.md#tier-01-decision-connections-tiers-and-placement)

**Why.** Moving 84 GB to IA saves money monthly but costs money to read back. Show both.

**Outcome.** Before a re-tier, Tidy apply or placement policy, show the storage saving alongside one-time transition and retrieval costs and minimum-duration penalties.

**Acceptance**

- Assumptions listed next to the numbers

**Checks:** `web`; `rendered`

## COST-06 Advisory archival rules (M5)

`P3` · `M` · Build · Backend, Web · Public API change

Depends on: [TDY-04](tidy-mode.md#tdy-04-tidy-deck-candidates-api), [TDY-03](tidy-mode.md#tdy-03-access-recency-signal)

**Why.** Rules should suggest, never act, until explicit policy semantics exist.

**Outcome.** Rules such as 'files over 50 MB not opened in 180 days under /Projects → suggest archive' produce a Tidy deck of proposals. A dry run shows affected counts and bytes. Nothing is applied automatically.

**Acceptance**

- No automatic moves or deletion
- Rules versioned and auditable

**Checks:** `postgres`; `contract`; `web`

## COST-07 Growth trend

`P3` · `S` · Build · Backend, Web · Fun

Depends on: [COST-01](#cost-01-usage-rollups)

**Why.** 'Your local disk fills up around March' is useful to know early.

**Outcome.** A daily usage snapshot per connection, a growth sparkline, and a simple fill-date projection for local storage.

**Acceptance**

- One row per day per connection
- The projection is labelled as an estimate

**Checks:** `postgres`; `web`
