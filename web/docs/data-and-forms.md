# Data, forms, tables, and rate control

## Router and Query

These libraries remain the sources of truth. A feature hook coordinates them behind
the [behavior boundary](code-organization.md#behavior-ownership); it doesn't create a
second cache or copy their state. Views call feature actions and render their result.

Router owns URL state, navigation timing, route boundaries, and client loaders and
actions. Query owns remote state: caching, freshness, deduplication, and invalidation.

- Define query options beside their owner and use them in both `clientLoader` and
  `useQuery`, through the one client in `src/lib/query/client.ts`. Tests use their
  own caches. Each `queryFn` calls a service instance and passes Query's `signal`;
  services know nothing about Query.
- `fetchQuery` in a loader reuses fresh data and waits for stale data.
  `ensureQueryData` returns stale data immediately, so use it only when that's what
  you want. `prefetchQuery` is for speculative warming, and its errors don't reach
  route boundaries.
- Services fetch through the `ApiClient` from `lib/api`: the generated
  `openapi-fetch` transport over `src/lib/api/generated/schema.ts`, which
  `npm run generate:schema` derives from `backend/contract/openapi.json`. Never edit
  the generated file. The client sends the session cookie and holds the CSRF token.
  `unwrap` returns a call's data or throws one `ApiError` whose `kind` is `network`,
  `http`, or `invalid-response`, with the server's `ApiErrorResponse` as `body`;
  aborts pass through. The contract types responses, so there's no Zod parsing of
  them; Zod validates settings and forms. Don't cancel shared keys when leaving a
  route, because another consumer may need them.
- The shared client retries once, and only network and 5xx failures. A 401 in a
  loader redirects to `/sign-in`. A successful sign-in clears the whole cache, since
  one tab has one session. Reset stores that hold user data at the same time.
- Don't copy remote data into Zustand, loader return values, or effects.

## Forms

Use TanStack Form v1 with Zod v4 through Standard Schema, with no Hook Form. Aria owns
labels, focus, relationships, and keyboard. TanStack owns value, touched state,
validation, and submission.

- Put FieldLabel, FieldDescription, and FieldError inside the Aria field (`TextField`,
  `Select`, `CheckboxField`) so Aria links them to the control. shadcn's Aria examples
  put the label beside the control, which leaves it unlinked. The TanStack binding
  (`useAppForm`) is in `lib/form`.
- Wire value, onChange, onBlur, isInvalid, and error text explicitly. Aria's onChange
  passes a value, not an event.
- Have one validation owner. If TanStack validates, set `validationBehavior="aria"`
  and don't repeat errors from the browser or the schema.
- Handle schema transforms at submit. Parsed output doesn't replace field values.
- Have one submission owner: a Query mutation whose `mutationFn` calls a service, or a
  `clientAction` through a fetcher when route semantics matter. Block duplicate submits, show failures, and invalidate
  the affected queries on success. Router revalidation doesn't invalidate fresh Query
  data.
- Keep parse-submit-success-reset and explicit reset/retry behavior in the form
  feature's hook. Field layout belongs in its view. Keep the schema and defaults
  colocated with the form domain; a schema beside its consumer isn't a design flaw.

## Tables and rate control

Table is v9. Many shadcn Data Table snippets are v8 (`useReactTable`, row models).
Use one semantic table with one selection and sort state, and never nest an Aria table
in a native one. Define row IDs. Keep filters and sort in the URL when they should
survive navigation.

With an Aria Table, Aria owns semantics, keyboard, and selection gestures, and Table
owns the state. Aria sees only the rendered page, so pass it that page's selection
and merge its changes by row ID. Skip the loader for search-only navigations
(`shouldRevalidate`) when the data doesn't depend on them. A search box backed by the
URL keeps its own text (`lib/url-state`), because the URL updates after typing.

The table feature owns URL/Table/Aria adaptation, including selection merging and
history policy. Its view receives renderable state and named callbacks rather than
implementing those transitions inside JSX.

Pacer is pinned at 0.23.0. Use its React adapter, not custom timer hooks. Cancel
pending work on unmount, treat cancel and flush differently, handle IME composition,
and never let a stale search overwrite a newer one. Debounce a value by delaying its
URL write; pace a mutation with an async throttler and let Query own the call. For
autosave, flush on unmount so the last edit saves. In 0.23.0, an edit made during a
running save waits where `cancel()` can't reach it and `isPending` doesn't show it, and
`flush()` during a trailing save starts a second save. The example numbers each save
request, skips discarded ones, and allows Save now only while nothing is saving.

Keep draft, scheduling, cancellation, flushing, and recovery under one feature owner.
Its public actions must describe what they actually guarantee, including the
difference between pending and in-flight work. Test a queued edit during a running
save as well as a timer waiting while idle; the two cases can behave differently.

Use Router's NavLink for navigation state, Zustand for shared client state (uploads
in `lib/transfers`, which run whichever screen is showing), and local state for
everything else.

## References

[React Router SPA](https://reactrouter.com/8.4.0/how-to/spa) ·
[Query with a router](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching) ·
[TkDodo](https://tkdodo.eu/blog/react-query-meets-react-router) ·
[shadcn TanStack Form](https://ui.shadcn.com/docs/forms/tanstack-form) ·
[Form](https://tanstack.com/form/latest) · [Table](https://tanstack.com/table/latest) ·
[Pacer](https://tanstack.com/pacer/latest) · [React Aria](https://react-aria.adobe.com/)
