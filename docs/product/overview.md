# Product overview

## Purpose and audience

Filebonsai is a polished, open-source, self-hosted file library: a familiar browsing
experience backed by storage the operator controls. The initial user is the deployment
owner. The product's substance is reliable file handling, clear authorization,
recoverability, storage placement, and eventually understandable cost and archival
controls—not a generic cloud-drive clone or an agent platform.

BYO keys means operator-supplied storage credentials. It does not mean end-to-end
encryption or operator-blind storage. The trusted server can read file contents and
the credentials it uses. Filebonsai requires no AI subscription or LLM API at runtime.

The project should demonstrate polished product delivery and serious backend
engineering: explicit transactions, permissions, retries, concurrency, migrations,
immutable versions, recovery, and operation after restart. Claims about usability,
performance, provider compatibility, or durability require observed evidence.

## Product principles

- Self-hosting works locally with ordinary container tooling before cloud complexity.
- One workspace and local owner come first, but isolation is tested with a second
  principal before multi-user invitations exist.
- Logical organization is independent from physical placement. Rename and move update
  metadata; they do not normally rename stored objects.
- Storage capabilities are explicit. Do not pretend local filesystems and object
  stores have identical semantics.
- Mobile is a short-term delivery priority, not the product's sole identity. Desktop
  information density and configurability remain first-class.
- The web client uses React/TypeScript. The iOS client uses SwiftUI, UIKit where useful,
  and TCA dependency boundaries. No near-term Android commitment exists.

## Delivery milestones

| Milestone | Observable outcome | Boundary |
| --- | --- | --- |
| M0 | Reproducible backend, schema, contract export, and generated-client checks | Engineering foundation, not a released product |
| M1 | Sign in; browse/create folders; upload locally; download identical bytes; recover interruption | Whole-body retry from byte zero; local storage only |
| M2 | One supported cloud provider with verified multipart recovery | Prove one real provider before adding another |
| M3 | Rename/move, versions, tags, trash/restore, thumbnails, and read-only sharing | Each feature gets its own contract and authorization tests |
| M4 | Tested install, upgrade, export, restore, and operations guidance | Only measured guarantees are documented |
| M5 | Dated cost estimates, advisory archival rules, and additional destinations | No destructive automation without explicit policy semantics |

Security, migration, and restart guarantees begin with the feature that needs them;
they are not deferred to the operations milestone.

## M1 scenarios

1. From a clean checkout, start the app and PostgreSQL, create the local owner through
   an administrative path, and sign in without an external identity provider.
2. Browse the root, create and enter a folder, and return through breadcrumbs.
3. Upload an arbitrary permitted synthetic file and see honest transfer/finalization
   state before it becomes available.
4. Download it and match its SHA-256 to the source; preview failure never blocks the
   original download.
5. Retry an interrupted body on the same upload intent without creating another file;
   reconcile uncertain finalization after restart.
6. Prove a second principal cannot list, read, download, cancel, or finalize the
   owner's resources.
7. Give understandable outcomes for zero-byte files, long/Unicode names, duplicates,
   unavailable storage, configured limits, and expired sessions.

## Later capabilities

Later slices may add immutable version history, tags, reversible trash, constrained
previews, revocable read-only sharing, audit events, export/restore, storage policies,
dated cost estimates, replicas, and archival restore. A file version may have several
verified physical copies without becoming several logical files. Replication is not
an independent retained backup.

## Explicit non-goals and open product choices

M1 excludes collaborative document editing, desktop sync, client-only encryption,
arbitrary public hosting, automatic archival, autonomous reorganization, and a hosted
multi-tenant service. AI features are optional future work and must preserve user
authorization, reversibility, and prompt-injection boundaries.

The first cloud provider, open-source license, public release process, supported
deployment matrix, sharing defaults, retention semantics, and AI runtime scope remain
decisions—not implied commitments.
