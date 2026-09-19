# Documentation map

Everything linked here is active. The repository does not keep historical handoffs,
superseded specifications, or duplicate “canonical” copies in the working tree; use
Git history when provenance is needed.

## Product

- [`product/overview.md`](product/overview.md): purpose, audience, milestones,
  scenarios, scope, and non-goals.
- [`product/domain.md`](product/domain.md): domain vocabulary, relationships, naming,
  identity, and lifecycle boundaries.
- [`product/catalog.md`](product/catalog.md): currently implemented Catalog behavior.
- [`product/invariants.md`](product/invariants.md): stable cross-cutting guarantees and
  their evidence oracles.
- [`product/design.md`](product/design.md): active visual direction, required UI states,
  accessibility, and configurable-shell requirement.

## Architecture and API

- [`architecture/system.md`](architecture/system.md): system shape and module ownership.
- [`architecture/backend.md`](architecture/backend.md): Java capability boundaries.
- [`architecture/storage-and-transfers.md`](architecture/storage-and-transfers.md):
  storage trust model, upload states, reconciliation, processing, and recovery.
- [`api/conventions.md`](api/conventions.md): observable HTTP and wire rules.
- [`api/openapi-codegen.md`](api/openapi-codegen.md): code-first export and generated
  client workflow.
- [`decisions/`](decisions/): accepted choices whose rationale affects future work.

## Development

- [`development/status.md`](development/status.md): verified implementation state,
  next sequence, and unresolved decisions.
- [`development/principles.md`](development/principles.md): product-building,
  collaboration, and learning goals that affect how work is presented.
- [`development/local-setup.md`](development/local-setup.md): local prerequisites and
  commands.
- [`development/java.md`](development/java.md): Java structure and style.
- [`development/testing.md`](development/testing.md): checks and evidence expectations.

Root [`AGENTS.md`](../AGENTS.md) is the single execution contract. Repository skills
under `.agents/skills/` add task-specific procedure without repeating product truth.
