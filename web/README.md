# Filebonsai web client

The React Router single-page Catalog uses the consumer-owned TypeScript API boundary:
`openapi-typescript` derives types from the committed backend contract and
`openapi-fetch` provides the handwritten service. The interface discovers the
workspace root, browses folders, and creates folders with TanStack Form.

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
