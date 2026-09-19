---
name: filebonsai-api-contract
description: Change or verify Filebonsai's code-first Java API, springdoc export, and generated Swift/TypeScript clients. Use for controller/DTO/schema/client compatibility work; not for internal-only refactors.
---

# Filebonsai API contract workflow

Java controllers, public DTOs, validation, and documentation annotations own the HTTP
contract. Springdoc output, fixtures, and generated clients are derived and must not be
hand-edited.

1. Define wire behavior and compatibility: errors, required/nullable/omitted fields,
   open values, pagination, formats, authentication, and evolution expectations.
2. Change Java source and HTTP behavior tests together.
3. From `backend/`, run `./mvnw test`; do not export from a failing suite.
4. Once the source is stable, run `./scripts/verify.sh` once to export, generate, and
   check both clients; inspect the resulting OpenAPI diff. Do not separately run the
   export, generation, or client commands unless diagnosing a concrete failure.
5. If the task also changes a PostgreSQL guarantee, batch its required PostgreSQL test
   with the final verification request rather than requesting an additional approval.
6. Before claiming the Java-to-client loop is complete, request the read-only contract
   reviewer for a material public change.

Fix Java source, annotations, or generator configuration rather than patching derived
output. Generation does not prove runtime validation or compatibility: test relevant
success/error/null/extra-field/unknown-value cases plus decimal-string byte counts,
timestamps, and pagination.
