# Filebonsai

Filebonsai is a polished, open-source, self-hosted file library for people who want
control of their storage. It starts as a Java/Spring modular monolith with PostgreSQL
and generated transports for planned React and Swift clients.

```text
backend/   Java 21, Spring Boot, PostgreSQL, Flyway, jOOQ
web/       React/TypeScript application (planned)
ios/       SwiftUI/TCA application (planned)
docs/      active product, architecture, API, and development truth
infra/     runtime and deployment resources
.agents/   repository-local Filebonsai skills
.codex/    specialized Codex agent profiles
```

Catalog is the first vertical slice. Java controllers and DTOs author the HTTP
contract; springdoc exports OpenAPI, and pinned TypeScript/Swift generators validate
downstream compatibility. The PostgreSQL catalog adapter is not exposed through HTTP
until authentication supplies trusted request scope.

Run backend checks from `backend/`:

```sh
./mvnw test
./scripts/verify.sh
```

PostgreSQL tests require Docker. Start with the active [documentation map](docs/README.md)
and [verified status](docs/development/status.md). Agent instructions live in
[`AGENTS.md`](AGENTS.md); superseded material lives only in Git history.
