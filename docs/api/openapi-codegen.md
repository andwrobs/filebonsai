# OpenAPI and client generation

The contract pipeline is:

```text
backend Java controllers + DTOs
        ↓ springdoc
backend/contract/openapi.json
        ├── pinned TypeScript generator
        └── pinned Swift generator
```

Run `cd backend && ./scripts/verify.sh` to test the backend, export the contract and fixtures, validate the schema, regenerate disposable clients, and run the TypeScript/Swift compatibility suites.

The current generated clients live under `backend/clients/` only as verification output. When `web/` and `ios/` become real applications, generated transports should initially live with their consumers (`web/app/api/generated/` and an iOS `API/Generated/` area). Promote a client into `packages/` only if it gains independent reuse, tests, lifecycle, or distribution value.

Generated files must not be manually edited. Fix Java source, DTOs, controller annotations, or generator configuration and regenerate.
