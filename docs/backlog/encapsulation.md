# Encapsulation and application orchestration

Keep React views readable as the product grows. Components render state and dispatch user intent. Capability hooks/controllers own request sequencing, cancellation, mutation state and errors; stores own shared state whose lifetime exceeds a view. Pure functions own policies and state transitions. DOM focus, measurement and local presentation state may remain in components or focused UI hooks.

Observed on main at `5fcca5d` (2026-09-28): `web/app/routes/library.tsx` embeds folder-create orchestration; `features/catalog/file-preview.tsx` owns fetching, cancellation and Blob cleanup; `features/catalog/inspector.tsx` combines a controller hook with panel presentation; `features/transfers/transfer-controls.tsx` combines download logic and tray effects; `features/shell/app-navigation.tsx` fetches storage detail. The existing `transfer-store.ts` already owns transfers outside route lifetime and should be preserved.

This is an incremental behavior-preserving epic, not a framework migration or a ban on hooks inside components. React Router remains the route boundary. Choose React Query/Zustand only if a concrete ownership problem needs them. [React's custom-hook guidance](https://react.dev/learn/reusing-logic-with-custom-hooks) (checked 2026-09-28) supports extracting reusable behavior; a hook call alone does not create shared state. Each slice should be reviewable independently and should not block unrelated product work.

See [the backlog index](README.md) for pickup, checks and retirement rules.

## ARC-01 Decision: web state and effect ownership

`P1` · `S` · Decision · Web, Docs

Depends on: none

**Why.** “Move logic into hooks” needs a precise boundary to avoid replacing large components with large hooks.

**Outcome.** Document current owners and choose capability-local controller interfaces, injected service dependencies, route loading responsibilities, shared-store lifetimes, cache invalidation and reset on identity/workspace change. Include one small before/after example from Library.

**Acceptance**

- Inventory server, form, selection, layout, preview and transfer state with one owner each.
- Components may retain UI-only state; business sequencing is testable without rendering a whole page.
- Record a minimal-library recommendation and an explicit trigger for adding a shared cache/store package.

**Settle first.** Router loader versus client query-cache ownership; keep existing transfer semantics and generated transport boundary.

**Invariants:** INV-01, INV-09, INV-10, INV-14

**Read:** `docs/architecture/system.md`, `docs/development/status.md`, `web/app/routes/library.tsx`, `web/app/features/transfers/transfer-store.ts`

**Checks:** `decision-review`

## ARC-02 Extract Library commands and mutation lifecycle

`P2` · `M` · Build · Web

Depends on: [ARC-01](#arc-01-decision-web-state-and-effect-ownership)

**Why.** Folder creation currently coordinates request, form reset, errors and revalidation in the route component.

**Outcome.** Move Library command orchestration to a capability hook/controller with injected service calls. Retain thin Router adapters and presentational form/list components; preserve the server-side sort contract merged in PR #17 when editing the route.

**Acceptance**

- Success, conflict, failed response and route change preserve current observable behavior.
- A stale mutation reply cannot reset a different folder form or revalidate the wrong identity context.
- Tests exercise intent and outcomes through the controller, rather than snapshotting hook implementation details.

**Settle first.** Idempotency-key lifetime and retry behavior must preserve the accepted API guarantee; record unrelated bugs separately.

**Invariants:** INV-05, INV-09, INV-14

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `web`; `rendered`

## ARC-03 Extract preview and download resource owners

`P2` · `M` · Build · Web

Depends on: [ARC-01](#arc-01-decision-web-state-and-effect-ownership)

**Why.** Blob lifetime, aborts and version races should be easy to reason about independently of markup.

**Outcome.** Extract preview loading and original-download commands into capability-owned hooks/controllers with explicit state and cleanup. Keep extension/size policy pure and preserve the current original-preview security boundary.

**Acceptance**

- Rapid A→B selection, version change, unmount, fetch failure and decode failure never display stale content.
- Abort and Blob revocation are tested, including failed image decode; preview failure still leaves download available.
- Limits apply before and after fetching; unsupported HTML/SVG never become inline content.

**Settle first.** Owner and lifetime of a Blob shared by multiple observers; do not introduce caching without a measured need.

**Invariants:** INV-12, INV-14, INV-15

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `web`; `rendered`

## ARC-04 Separate inspector state from panel presentation

`P2` · `M` · Build · Web

Depends on: [ARC-01](#arc-01-decision-web-state-and-effect-ownership)

**Why.** Inspector selection and persistence are currently colocated with modal/docked rendering.

**Outcome.** Move inspector state transitions and preference persistence behind a dedicated capability hook. Keep focus trapping, element refs and breakpoint measurement in UI adapters with a narrow interface.

**Acceptance**

- Existing Back-navigation and 1100px crossing regressions remain covered.
- Closing from toolbar versus row restores the correct focus; no drawer opens merely because layout changed.
- Pure state tests do not import JSX/browser globals; rendering remains responsible for accessible dialog semantics.

**Settle first.** Boundary between state transitions and DOM focus commands; avoid a universal modal manager.

**Invariants:** INV-14

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `web`; `rendered`

## ARC-05 Shared storage summary and transfer completion events

`P2` · `M` · Build · Web

Depends on: [ARC-01](#arc-01-decision-web-state-and-effect-ownership)

**Why.** Navigation and the tray currently coordinate reads and refreshes through component effects.

**Outcome.** Give storage summary freshness and transfer-completion invalidation explicit owners. Views subscribe through hooks; completed transfers publish a scoped event to the catalog/storage read boundary. Transfer execution stays in its existing store.

**Acceptance**

- Unmounting tray/navigation or changing folder never stops or restarts a transfer.
- One completion does not cause duplicate refresh storms with multiple observers; failed refresh preserves honest stale/error state.
- Sign-out/workspace changes clear private cached data and fence late replies.

**Settle first.** Deduplication and cache lifetime; no extra global store solely to relocate a useEffect.

**Invariants:** INV-01, INV-09, INV-10, INV-14

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `web`; `rendered`

## ARC-06 Enforce capability boundaries and feature patterns

`P2` · `S` · Build · Web, Docs

Depends on: [ARC-02](#arc-02-extract-library-commands-and-mutation-lifecycle), [ARC-03](#arc-03-extract-preview-and-download-resource-owners), [ARC-04](#arc-04-separate-inspector-state-from-panel-presentation), [ARC-05](#arc-05-shared-storage-summary-and-transfer-completion-events)

**Why.** The resulting architecture should be easy for the next contributor to follow.

**Outcome.** Add targeted import rules for presentation versus transport, generated-code access and cross-feature internals. Document one real controller/view example and the accepted exceptions for route loaders and UI hooks.

**Acceptance**

- A forbidden direct transport import in a designated presentational module fails a narrow check with an actionable explanation.
- No broad shared package, transport duplication or generic base controller is introduced.
- Existing examples cover mutation, cancellation and a store subscription; exceptions are named and bounded.

**Settle first.** Lightest enforcement mechanism compatible with current tooling; avoid brittle hook-count or line-count rules.

**Invariants:** INV-01, INV-14

**Read:** `docs/product/domain.md`, `docs/product/design.md`, `docs/product/invariants.md`

**Checks:** `web`; deliberate failing-boundary fixture

## ARC-07 Backend orchestration boundary audit

`P2` · `M` · Spike · Backend, Docs

Depends on: none

**Why.** The same ownership discipline should apply to storage, jobs and catalog use cases.

**Outcome.** Audit a bounded upload-finalization and storage-summary path against existing capability ports. Identify concrete coupling or transaction/I/O violations and propose small path-owned refactors; extend ENG-06 rather than duplicate architecture tests.

**Acceptance**

- Each finding cites a current path, behavior at risk, owning capability and smallest refactor/check.
- Preserve public DTO/domain/jOOQ separation and do not introduce services or a generic shared layer.
- If no material violation exists, record that outcome instead of inventing a refactor.

**Settle first.** Choose two entry points at pickup; no repository-wide rewrite.

**Invariants:** INV-07, INV-09, INV-10

**Read:** `backend/AGENTS.md`, `docs/architecture/backend.md`, `docs/architecture/storage-and-transfers.md`

**Checks:** `spike-notes`; read-only persistence review for material storage findings
