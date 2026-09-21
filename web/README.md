# Filebonsai web client

The consumer-owned TypeScript API boundary uses `openapi-typescript` to derive types
from the committed backend contract and `openapi-fetch` for the handwritten service.
The React application will build on this boundary rather than calling generated
transport details directly.

```bash
npm install
npm run generate:schema
npm run typecheck:run
npm test
```

`src/lib/api/generated/schema.ts` is generated and must not be edited manually. The
service includes cookies on every request and manages the double-submit CSRF token for
state-changing calls. Callers must provide stable idempotency keys for folder creation
so retries retain the same intent.
