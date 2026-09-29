# Framework Mode, SPA only

## Shape

- `react-router.config.ts`: `appDirectory: "src"`, `ssr: false`.
- `src/routes.ts`: explicit route registration. Route modules own their behavior.
- `src/root.tsx`: document, providers, root fallback, root error boundary.
- Types come from `./+types/<module>` (`Route.ClientLoaderArgs`,
  `Route.ClientActionArgs`, `Route.ComponentProps`). Never edit `.react-router/types`.
- `@react-router/dev/vite` handles routing and route splitting. `@vitejs/plugin-react`
  is only for Vitest, never alongside the router plugin in builds.

## Data and actions

Follow `docs/data-and-forms.md`: shared query options, `fetchQuery` in
`clientLoader`, one submission owner, and Query invalidation after mutations. GET
search forms may use Router's `<Form>` to update the URL.

## Rendering and navigation

SPA mode still renders the root fallback at build time, so module evaluation and that
first render must not touch `window`, `localStorage`, or user data. Avoid unneeded
root loaders. Don't add server actions, runtime server loaders, RSC, or extra
prerendered routes. `@react-router/node` and `isbot` exist only for the default build
entry; nothing runs on a server.

Navigate with Link/NavLink, or Aria links under the RouterProvider bridge. Never add
`BrowserRouter` or `createBrowserRouter`. Show pending and recoverable error states.

Output is `build/client`. The host rewrites app URLs to `index.html` and serves assets
and API paths normally. Test direct deep links.

## Upstream docs by task

Relative to `node_modules/react-router/docs`:

| Task | Docs |
| --- | --- |
| Routes and types | `start/framework/routing.md`, `how-to/route-module-type-safety.md` |
| Data and mutations | `start/framework/data-loading.md`, `start/framework/actions.md` |
| First render and deploy | `how-to/spa.md`, `start/framework/rendering.md` |
| Pending, errors, navigation | `start/framework/pending-ui.md`, `how-to/error-boundary.md` |
| Upgrades | `upgrading/` and the release notes |

If docs move, use the installed release's paths. Website:
https://reactrouter.com/8.4.0/how-to/spa (swap in the installed version).
