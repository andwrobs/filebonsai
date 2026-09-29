# Web instructions

Inherit root `../AGENTS.md`. Before web changes read `../docs/development/status.md`,
`../docs/product/design.md`, the task-relevant product and API documents, and the
docs here: [code organization](docs/code-organization.md),
[data and forms](docs/data-and-forms.md), and [testing](docs/testing.md). Use the
`new-route` skill to add a page and `react-router` for other route work.

This app follows the `react-router-spa-template` starter (version in `package.json`
under `template`); decision
[0011](../docs/decisions/0011-web-client-follows-the-spa-template.md) records it and
the deviations below.

## Conventions

- React Router v8 Framework Mode, SPA only: `ssr: false`, app in `src`, routes in
  `src/routes.ts`. Use clientLoader/clientAction, generated route types (never edit
  `.react-router/types`), the root HydrateFallback, and static `build/client` output.
- `src/lib/ui` is the design system (React Aria + shadcn `aria-nova`): one module per
  component, no category folders, and no imports of React Router, TanStack, Zustand,
  other `~/lib` code, or routes (Biome enforces this). Keep `components.json` aliases
  in sync.
- Query owns remote data, Router owns URL state, TanStack Form owns form state. Use
  Zustand only for shared client state none of them own, such as uploads. Zod
  validates settings and forms.
- Dependencies point one way: components → feature hooks, stores, and query options
  → services → clients (`lib/api`). A service is a stateless `createXService(deps)`
  factory typed by an `XService` interface. `src/services.ts`, the composition root,
  builds each one once; everything else imports the instances.
- Route-private code and tests stay beside the route. Shared code goes in a named
  `src/lib` capability. Routes never import each other's private code.
- Prefer strong encapsulation. Route components compose features; views render state
  and emit intent. Keep workflow transitions, request coordination, and side effects
  in a named owner, not JSX handlers. See the
  [ownership rules](docs/code-organization.md#behavior-ownership).
- Preserve keyboard, focus, labels, reduced motion, and loading/empty/error/recovery
  states.
- npm, Node 24. Update Router packages together and the lockfile with the manifest.

## Filebonsai specifics

- The transport is generated: `npm run generate:schema` derives
  `src/lib/api/generated/schema.ts` from `../backend/contract/openapi.json`. Never
  edit it; public API changes follow the `filebonsai-api-contract` skill. Services
  call `unwrap(api.http.GET(...))` instead of the starter's Zod `fetchJson`.
- The contract's `/api/v1` paths are same-origin; there is no API URL setting. The
  one `ApiClient` sends the session cookie and holds the CSRF token.
- Never log or display passwords, session tokens, signed URLs, provider upload IDs, or
  storage paths. A user filename is metadata, never a path.
- Transfers belong to `src/lib/transfers`, never to a screen: navigation changes who
  observes an upload, not whether it runs. M1 retry resends the whole body from byte
  zero.
- `src/styles/index.css` holds every token. The shell is on `lib/ui`; the other
  screens still use `app.css` and the role aliases in `src/styles/tokens.css`, both
  excluded from Biome, and move onto `lib/ui` screen by screen.

## Checks

`npm test` runs Biome, route typegen and `tsc`, Vitest, and the build. UI claims need
a rendered check at 1440×900 and 390×844 against the real PostgreSQL-profile backend.
A compile, an empty suite, or an old screenshot proves nothing.
