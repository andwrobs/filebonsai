# System architecture

Filebonsai starts as one modular-monolith backend with two client applications. The repository makes those ownership boundaries visible without inventing service or package taxonomies early.

```text
backend/ Java + Spring
    │
    ├── springdoc → OpenAPI → generated TypeScript transport → web/
    │                         └→ generated Swift transport → ios/
    │
    └── PostgreSQL/Flyway/jOOQ adapters behind application ports
```

React Router is the web application's routing architecture. SwiftUI/TCA is the iOS application's state and UI architecture. Neither framework depends on springdoc; each consumes a generated transport through a handwritten application boundary. Native transfer execution belongs to a durable transfer dependency, not to the screen task observing it.

## Ownership

- `backend/` owns Java domain, application, HTTP, persistence, and fixture code.
- `web/` will own the React Router application and its local generated client once implementation starts.
- `ios/` will own the SwiftUI/TCA application and its local generated client once implementation starts.
- `docs/` is durable architecture, API, product, and engineering guidance.
- `infra/` describes runtime resources such as local PostgreSQL or object storage; it does not contain application code.
- `scripts/` contains small commands that compose existing tools.
- `.agents/` contains Filebonsai-specific task skills; `.codex/agents/` contains only specialized worker and reviewer profiles.

Generated code remains disposable. Changes are made in Java controllers/DTOs or generator configuration, then regenerated and checked.

The initial deployment is a container image containing the JVM application plus
PostgreSQL and durable volumes through Compose. Users do not install a host JDK. The
server initially serves API and built web assets at one origin, runs unprivileged with
an explicit writable data root, and expects HTTPS at an ingress/proxy outside the
loopback development profile. Native Cloudflare Workers is not a JVM target;
Cloudflare R2 is the selected first object-store adapter, pending implementation
and real-provider verification.

## Deliberately deferred categories

Do not add `packages/`, `tooling/`, `services/`, or `apps/` merely because they might be useful later. Introduce one when there is a real reusable library, substantial maintained developer software, independently deployed responsibility, or enough applications to justify grouping.

Superseded plans and imported handoffs live only in Git history. Every document in the working tree is active.
