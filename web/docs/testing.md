# Testing

Node 24 (`.nvmrc`); minimum 22.22.0. No CI job runs these checks yet; see the
foundations backlog in `../../docs/backlog/foundations.md`.

| Command | Use |
| --- | --- |
| `npm test` | Lint, route typegen and typecheck, tests, build |
| `npm run test:run -- <file>` | One file while you work |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Coverage for `src`, no threshold |
| `npm run build:analyze` | Bundle treemap |
| `npm run deps:check` | Latest registry versions; changes nothing |

Vitest fails when it finds no tests. Test behavior through scenarios. Don't test
generated types or wording. `test-utils/render-route.tsx` renders route modules with
the router, Query, and the Aria link bridge, and exposes the URL and Back.

Test a service by calling its factory with fakes typed as its `Deps` interfaces, so
contract drift fails to compile, and assert through the returned interface. Don't
export helpers for tests. Route tests answer requests with `stubApi` from
`test-utils/stub-api.ts`, which stubs the global `fetch` the services read per
request, or replace a method with `vi.spyOn(xService, "method")` on the instance from
`~/services`. Tests that send a `Blob` body or read files from disk declare
`// @vitest-environment node`, because jsdom's `File` doesn't reach Node's `fetch`.

UI changes need a rendered check at 1440×900 and 390×844, with keyboard and focus,
against the real PostgreSQL-profile backend (`../../docs/development/local-setup.md`).
Check direct deep-link refresh, back and forward, the initial fallback, and whichever
empty, error, recovery, disabled, and pending states apply. None of this is automated
yet.

- Forms: invalid and valid submit, blur and touched state, errors linked to fields,
  duplicate submit, server failure.
- Tables: sort, filter, pagination, empty results, row identity.
- Pacer: use controlled time to prove cancel, flush, unmount cleanup, and that stale
  results never win. Assert behavior, not timers. Fake only the app's timers
  (`toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"]`)
  so React's scheduler keeps running; `vitest-setup.ts` lets Testing Library advance
  them.
