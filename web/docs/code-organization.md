# Code organization

A route owns the components, behavior, tests, and helpers that change with it. Code
moves to `src/lib` only when routes share it or it wraps all of them, and each
directory there is a named capability.

```text
src/
  root.tsx                  # Document, fallback, error boundary, route focus
  routes.ts
  services.ts               # Composition root: builds every service once
  lib/
    ui/                     # Design system, one module per component
      button.tsx            # A file...
      date-picker/          # ...or a folder once it has siblings
        date-picker.tsx
        date-picker.test.tsx
        index.ts            # Keeps the import path ~/lib/ui/date-picker
      utils.ts              # cn
    app/                    # Providers and route focus
    query/client.ts         # QueryClient shared by loaders and React
    api/                    # Generated contract, ApiClient (CSRF), ApiError, unwrap
    env/                    # VITE_ settings: schema (checked by vite.config.ts), env
    form/                   # TanStack Form bound to lib/ui fields
    meta/                   # App name and page titles
    url-state/              # URL-backed input drafts
    catalog/                # Entries, folders, and their queries (Library routes)
    storage/                # Storage summary and upload limit (Storage, shell, uploads)
    transfers/              # Upload store, tray, and control; outlives every route
    format/                 # Byte counts for display
  routes/
    projects/
      components/           # Route-private component modules
        FilterBar/
          FilterBar.tsx     # Thin connected entry point
          FilterBarView.tsx # Renders props and emits intent
          useFilterBar.ts   # Private behavior owner
          FilterBar.test.tsx
          index.ts
      lib/                  # Non-view code shared within the route
        results.ts          # Schema and types
        results.service.ts  # ResultsService and createResultsService
        results.service.test.ts
        results.query.ts    # Query options calling resultsService
      projects.route.tsx    # Registered in src/routes.ts
      projects.route.test.tsx
```

## Placement

| Code | Goes in |
| --- | --- |
| Used by one component | That component's folder |
| Coordinates a route, or used by several of its components | The route root or its `lib/` |
| Used across routes | A named capability in `src/lib` |
| Visual primitive or pattern with no app knowledge | `lib/ui` |
| Wraps every route (providers, layout, navigation) | `lib/app` |
| Binds Form, Table, Query, or the router to UI, shared across routes | A capability such as `lib/form`, never `lib/ui` |
| A service instance | `src/services.ts`; the factory stays with its domain |

Tests sit next to the code they test. Keep a route's `lib/` flat until some files form
a subsystem, then group them by concept (`lib/results/query.ts`), not by type. No
`queries`, `stores`, `types`, `utils`, `hooks`, or `components` folders inside any
`lib`. A route's `components/` folder is the only components folder.

## Layers

Dependencies point one way. Nothing imports a layer above it.

```text
components   route modules, connected components, views
state        feature hooks, stores, query options
services     built once in src/services.ts
clients      lib/api, settings
```

Views and connected components reach services only through the state layer. Route
loaders and actions use query options or a service.

A service receives its dependencies when it's created and returns an object typed by
an explicit interface. It holds I/O and domain decisions, never UI or client state.

```ts
// tasks.service.ts
export interface TasksService {
	list(options?: { signal?: AbortSignal }): Promise<Task[]>;
}

type Deps = { api: ApiClient };

export function createTasksService({ api }: Deps): TasksService {
	async function list({ signal }: { signal?: AbortSignal } = {}) {
		// The generated contract types the path, parameters, and result.
		return unwrap(api.http.GET("/api/v1/tasks", { signal }));
	}

	return { list };
}
```

- Name the file `<thing>.service.ts`, the interface `XService`, and the factory
  `createXService`. A stand-in for the same interface gets its own factory, such as
  `createDemoXService`.
- Factories, not classes: without `this`, methods pass safely as callbacks
  (`mutationFn: xService.save`). Use a class only when something requires one
  (`instanceof`, a `dispose()` lifecycle, many instances on a hot path), and say why
  in a comment at the definition.
- One `Deps` object, destructured in the signature. It lists interfaces (`ApiClient`,
  `LedgerService`), never factories or imported instances.
- Stateless, not pure: I/O is fine; state kept between calls isn't.
- The file holds the interface, `Deps`, and the factory. Helpers sit inside the
  factory above the public functions, and `return { ... }` lists the public API.
  Schemas, types, and pure helpers that others use go in the domain module beside it
  (`tasks.ts`).
- Services import no React, router, TanStack, Zustand, UI, routes, or service
  instances (Biome enforces this). No default exports.

`src/services.ts` is the composition root. It builds every service once, in
dependency order, and exports the instances; outside tests, no other module imports a
factory (Biome enforces this). Swap an implementation (a fake server, fixtures, a
demo mode) there, never in consumers.

```ts
// src/services.ts: one client, so every service shares the CSRF token
const api = createApiClient({ baseUrl: globalThis.location?.origin ?? "" });
export const ledgerService = createLedgerService({ api });
export const billingService = createBillingService({ api, ledger: ledgerService });
```

## Behavior ownership

Prefer strong encapsulation over spreading a workflow across files. A module's name
and public interface should tell a reader what it owns. Keep related state,
transitions, and effects together behind a small interface; extraction is useful
when it creates that boundary, not merely when it shortens a file.

- **Route modules** own framework exports (`meta`, loaders, actions, boundaries)
  and page composition. Their rendering functions don't implement feature workflows
  or assemble a collection of private component hooks. Loaders and actions delegate
  domain work to the owning module.
- **Views** render state and emit intent. Formatting, conditional rendering, and
  converting a DOM event to a value belong here. Submission sequences, cache
  invalidation, selection merging, URL synchronization, retries, and timer policies
  belong to the behavior owner.
- **Connected components** bind one cohesive behavior interface to a view. Keep
  this adapter thin; moving the route's entire workflow into another `.tsx` file
  doesn't separate rendering from behavior.
- **Feature hooks** own React subscriptions, lifecycle, and integration between the
  existing libraries. Keep pure decisions in nearby functions or a reducer when
  transitions become complex. A state-machine library is optional, not a default.
- **Services** follow the [layers](#layers). Group operations by domain; a service
  isn't a bucket for unrelated logic.
- **Stores** own genuinely shared client state. Actions set state or call a service;
  decisions stay in services and remote data stays in Query. Components subscribe
  with selectors. Stores never call each other's actions or subscribe to each other;
  a feature owner named for the user's intent coordinates them. Read another store
  with `getState()` only inside an action or handler, never while rendering. A store
  is global unless several independent instances must exist at once (one per open
  editor); then scope it with context and say why. Don't move local workflows into a
  global store just to empty a component. Preserve Query, Router, Form, Table, and
  Pacer ownership described in [data and forms](data-and-forms.md).

Local visual state (an open popover, a selected demo tab) can stay with its component.
Existing library bindings such as `lib/form` and app infrastructure such as route
focus may subscribe and manage lifecycle for their explicit purpose. Static pages
need no controller. Purity here separates rendering from application workflows;
it doesn't forbid every hook or require a wrapper around every primitive.

A self-contained feature exposes its connected entry point. Its hook and view stay
private unless another consumer has a concrete need for them:

```tsx
// FilterBarView.tsx
export function FilterBarView(props: FilterBarProps) { /* render from props */ }

// useFilterBar.ts: integrates queries, stores, and route state
export function useFilterBar(): FilterBarProps { /* ... */ }

// FilterBar.tsx: the only place that wires this feature
export function FilterBar() {
  const props = useFilterBar();
  return <FilterBarView {...props} />;
}

// index.ts: public entry point
export { FilterBar } from "./FilterBar";

// projects.route.tsx: composition
return <FilterBar />;
```

If several parts coordinate one workflow, give them a common feature owner instead
of independent controllers that synchronize each other. Use the smallest structure
that makes that ownership clear. Keep schemas, types, defaults, and pure helpers
beside their domain; they don't each need a layer or directory.

Expose meaningful actions such as `resetRequest`, `changeSearch`, or `discardPending`.
Consumers shouldn't sequence `form.reset()` and `mutation.reset()`, merge library
selection formats, or manipulate internal flags. Typed Form/Table bindings can pass
through a private adapter where necessary; don't duplicate their APIs or state.
Use discriminated unions for mutually exclusive workflow states when they remove
invalid combinations. Independent facts such as saving and having a queued edit may
coexist, so don't force them into an artificial single status.

When reviewing a behavior change, identify its owner, public actions, state source,
and lifecycle policy. Check that no layer reaches up, remote data stays out of
stores, and store actions hold no decisions. Follow an action from the view to its effect: a consumer that
must know the internal sequence signals a leaking boundary. Test observable
transitions, failures, cancellation, and navigation where relevant; hook counts,
file lengths, and naming checks don't prove encapsulation.

## Design system and app

`lib/ui` holds shadcn Aria primitives, patterns built from them, and `cn`. Subfolders
are components, never categories. It can import React, React Aria, styling utilities,
icons, and whatever its registry components need. It never imports React Router,
TanStack, Zustand, other `~/lib` code, or routes (Biome enforces this).

`root.tsx` renders `RouteFocus` and the routes inside `AppProviders`. Filebonsai's
shell is the pathless layout route `routes/app-shell`: the Library and Storage render
inside it, so its navigation and the transfer tray stay mounted between them, and
sign-in stands alone.

Aria `Link` and `LinkButton` navigate client-side through the `RouterProvider` in
`lib/app/AppProviders.tsx`, the only place the design system meets the router. Routes
don't import `lib/app`. Extract anything a route needs from it into its own capability.

Presentational parts such as `field.tsx` and `table.tsx` go in `lib/ui`. Bindings such
as a TanStack Form `createFormHook` or a TanStack Table data table stay in the route,
or move to a capability like `lib/form` once routes share them.

```text
routes/*  ──►  lib/<capability>  ──►  lib/ui
root.tsx  ──►  lib/app           ──►  lib/query, lib/ui
```

`src/lib` never imports `src/routes` (Biome enforces this), and routes never import
each other's private code.

Because `lib/ui` has no app imports, it can become a workspace package later without a
rewrite. Do that when it has its own API or owner, or a second app uses it.

## shadcn

The `components.json` aliases all point into `~/lib/ui`, so the CLI writes registry
files there and rewrites upstream `@/...` imports to match. Change the aliases and
this doc together.

- Refresh components by generating them in a scratch copy and diffing against
  `lib/ui`. Keep local changes, and never overwrite in bulk.
- Registry files keep upstream lowercase names. A component can become a folder with
  an `index.ts` re-export. The CLI doesn't know about folders: adding a component that
  depends on `button/` writes a new `button.tsx` that shadows it. Delete that file.
- A per-component `index.ts` is fine. A catalog-wide `lib/ui/index.ts` barrel isn't.
- Blocks (`registry:block`) land in `lib/ui` too. Move route links, data loading, and
  app state into `lib/app` or the owning route. Lint flags them.
