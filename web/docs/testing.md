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
| `npm run e2e` | Browser journey against a disposable stack; needs Docker |

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
empty, error, recovery, disabled, and pending states apply. `npm run e2e` automates
only the core journey below; the rest is still a manual check.

- Forms: invalid and valid submit, blur and touched state, errors linked to fields,
  duplicate submit, server failure.
- Tables: sort, filter, pagination, empty results, row identity.
- Pacer: use controlled time to prove cancel, flush, unmount cleanup, and that stale
  results never win. Assert behavior, not timers. Fake only the app's timers
  (`toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"]`)
  so React's scheduler keeps running; `vitest-setup.ts` lets Testing Library advance
  them.

## End-to-end

`npm run e2e` runs the Playwright suite in `e2e/` with pinned `@playwright/test`
1.59.1 and Chromium. It needs Docker and a JDK 21 or newer, so `npm test` does not
run it. On a new machine, run `npx playwright install chromium` once.

Global setup (`e2e/stack.ts`) starts a disposable PostgreSQL 17.6 container on a free
port. It builds `../backend` with `./mvnw package` when the jar is missing or older than
`backend/src/main` or the POM. It starts the backend with the `postgres` profile and a
generated owner password kept in a private temporary directory. Then it builds the web
client and serves it with `vite preview`, which proxies `/api` to that backend.
Teardown, including after Ctrl-C, stops all of it and deletes the directory. The run
never touches your local database, backend, or settings.

`journey.e2e.ts` signs in, creates and opens a folder, uploads a synthetic body, and
downloads it. It checks the saved file's SHA-256, then signs out. It runs in a
1440×900 `desktop` project and a 390×844 touch `phone` project, both with reduced
motion. The shell has no sign-out control yet, so `Session.signOut` calls the logout
API from the page.

Each test prints one line. A failure also prints its error, a screenshot path, and the
`npx playwright show-trace` command for its trace. Build, backend, web, and PostgreSQL
logs and failure artifacts go to the gitignored `e2e/.output/`. A trace records typed
values, including that run's disposable owner password.

New specs are named `*.e2e.ts`, which Vitest ignores. They import `test` and `expect`
from `e2e/fixtures.ts`. The fixtures supply `ownerPassword` and the page objects in
`e2e/pages/`, which click on desktop and tap on the phone. To run one project, use
`npm run e2e -- --project=phone`.
