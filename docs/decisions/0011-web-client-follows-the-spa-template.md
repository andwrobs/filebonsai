# 0011: Build the web client on the React Router SPA starter

Status: accepted
Date: 2026-09-29

## Context

`web/` grew as a hand-assembled React Router app: code split between `app/` and
`src/lib/api`, loaders calling a service class directly, a class-based transfer store,
hand-written CSS, and `node --test` over a listed set of files with no linter. The
owner maintains `react-router-spa-template`, a starter whose conventions cover the same
ground: code organization, layering, data ownership, forms, a design system, and
checks. The encapsulation backlog (ARC-01) asked for a decision on web state and effect
ownership and suggested adding React Query or Zustand only for a concrete need. On
2026-09-29 the owner chose to follow the starter instead, in two changes: first the
structure, data layer, and tooling with the look unchanged, then the screens on its
design system.

## Decision

`web/` follows the starter, regenerated from it with `--no-examples` and recorded under
`template` in `web/package.json`. `web/AGENTS.md` and `web/docs/` carry its
conventions. In summary:

- Layout: `appDirectory: "src"`, the `~/` alias, one folder per route with its private
  components and tests, and shared code in named `src/lib` capabilities.
- Ownership: Router owns URL state and route boundaries; TanStack Query owns remote
  data, shared by `clientLoader` and components; TanStack Form owns form state; Zustand
  holds only shared client state that none of them own. Views render state and emit
  intent, and a named owner holds each workflow.
- Layers: components → feature hooks, stores, and query options → stateless
  `createXService` factories built once in `src/services.ts` → the API client.
- Checks: `npm test` runs Biome (including the layering import rules), route typegen
  and `tsc`, Vitest, and the build.

Filebonsai departs from the starter where its own decisions or runtime require it:

- The transport stays generated (decision 0004): `openapi-typescript` types from
  `backend/contract/openapi.json` and `openapi-fetch`, wrapped by `lib/api`'s
  `ApiClient` and `unwrap`, which throw the starter's `ApiError`. Responses aren't
  parsed with Zod.
- There is no API URL setting. The contract's `/api/v1` paths are same-origin, which
  the session cookie and CSRF protection rely on. The one `ApiClient` holds the CSRF
  token, so it is a stateful client rather than a service.
- Uploads live in a Zustand store in `lib/transfers` that outlives every route. The
  upload limit is cached in Query and read again after a `413` or before a refusal.
- The shell is a pathless layout route (`routes/app-shell`) around the Library and
  Storage; sign-in stands alone. The starter's header, sidebar layout, and theme
  toggle were removed, and there is no dark theme yet.
- A successful sign-in clears the query cache. A loader that meets a 401 redirects to
  `/sign-in`.
- The shared query client retries once, and only network and 5xx failures.
- The dev server keeps port 5173 and proxies `/api` and the OIDC paths, so the local
  Compose stack is unchanged. It and the preview server listen on localhost only,
  unlike the starter's `host: true`, because the proxy would otherwise expose the
  backend, which binds 127.0.0.1, to the network. The container passes `--host`.
- No lefthook: its install step would write Git hooks for the whole monorepo.
- The starter's `new-route` and `react-router` skills live in the root
  `.agents/skills/`, pointed at `web/`.

## Consequences

- ARC-01 is settled by this record. ARC-02 to ARC-06 remain candidates and apply the
  starter's ownership rules to the Library workflows that moved over unchanged.
- Until the screens move onto `src/lib/ui`, `src/styles/app.css` and the role aliases
  in `src/styles/tokens.css` remain their styles, excluded from Biome. Raw colors live
  only in `src/styles/index.css`, which `tokens.test.ts` enforces.
- `openapi-typescript` 7.13 declares a TypeScript 5 peer; an npm override lets it run
  with the starter's TypeScript 6. The regenerated schema is byte-identical.
- Starter updates are applied by comparing `web/` with a fresh generation, not by
  merging the starter's history.
