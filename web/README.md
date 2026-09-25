# Filebonsai web client

The React Router single-page Catalog uses the consumer-owned TypeScript API boundary:
`openapi-typescript` derives types from the committed backend contract and
`openapi-fetch` provides the handwritten service. The interface discovers the
workspace root, browses folders, and creates folders with TanStack Form. Anonymous
visitors are sent to `/sign-in`; the owner password is submitted through the
CSRF-protected session API and is not persisted by the client.

```bash
npm install
npm run generate:schema
npm run typecheck:run
npm test
npm run build
npm run dev
```

`src/lib/api/generated/schema.ts` is generated and must not be edited manually. The
service includes cookies on every request and manages the double-submit CSRF token for
state-changing calls. Callers must provide stable idempotency keys for folder creation
so retries retain the same intent.

During local development, Vite proxies `/api` requests to the backend on port 8080.
Set `FILEBONSAI_API_PROXY_TARGET` to a different origin when the backend uses
another port, for example `http://127.0.0.1:8081`. Set `VITE_FILEBONSAI_OIDC=authentik`
when the backend has Authentik OIDC configured to add **Continue with Authentik** to
the sign-in page; the local Compose stack sets it.

Upload controls use a tab-owned transfer store so folder navigation does not stop work.
Before beginning an upload, the store reads the server's upload limit once per tab and
refuses larger files without sending anything, naming the limit. If the limit cannot be
read, or the server answers `413`, the server decides and the limit is read again.
Body progress is indeterminate until the server verifies it. Explicit retry first reads
server state and resends from byte zero only for an initiated session. Uncertain
completion offers a status check; it never assumes the original is available.
Cancellation is server-confirmed and fences late body responses. Each explicit transfer
operation refreshes CSRF to accommodate session rotation.

Keep the tab open: selected files and transfer tracking are held in memory and are not
restored after reload. Original downloads fetch a Blob before handing it to the browser,
so this control buffers the original rather than streaming directly to disk.
