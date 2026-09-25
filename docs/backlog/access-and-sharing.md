# Access & sharing

Keep the owner's account secure, and let them share read-only links they can revoke.

Sessions already persist in PostgreSQL, so session management is cheap. Passkeys are modern and fun. Sharing needs a threat model before any public route exists.

See [the backlog index](README.md) for how to pick up and retire items.

## ACC-01 Session management

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: none

**Why.** Sessions already persist in PostgreSQL, so showing and revoking them is cheap security value.

**Outcome.** List my active sessions (coarse device from the user agent, created, last seen, current), revoke one, or sign out everywhere.

**Acceptance**

- Revocation takes effect immediately
- No token material in responses

**Invariants:** INV-11  
**Checks:** `postgres`; `contract`; `web`; `rendered`

## ACC-02 Passkeys for owner sign-in

`P3` · `L` · Build · Backend, Web · Public API change · Fun

Depends on: none

In flight: Unmerged branch `codex/run-authentik-and-the-local` adds OIDC sign-in through Authentik. Settle whether external identity is part of the access model before starting.

**Why.** A modern, phishing-resistant sign-in, and fun to build.

**Outcome.** WebAuthn registration after password login, passkey sign-in, and listing and removing passkeys. Password bootstrap and reset remain the recovery path.

**Acceptance**

- Recovery path documented and tested
- Works in Safari and Chrome

**Settle first**

- Can passkeys replace password login entirely?

**Checks:** `postgres`; `contract`; `web`; `rendered`

## ACC-03 Decision: read-only sharing

`P2` · `M` · Decision · Backend, Docs

Depends on: none

**Why.** The first public route needs a threat model before any code.

**Outcome.** Covers tokens (unguessable, hashed at rest), expiry, revocation, optional passwords, preview vs download-only, folder shares (live or snapshot), route isolation (separate prefix, no session cookie, strict CSP, noindex), rate limits, metadata leakage, EXIF and GPS stripping, and audit.

**Acceptance**

- Abuse cases listed with mitigations

**Invariants:** INV-01, INV-11, INV-12  
**Checks:** `decision-review`

## ACC-04 File share links

`P3` · `L` · Build · Backend, Web · Public API change

Depends on: [ACC-03](#acc-03-decision-read-only-sharing), [ORG-11](organize.md#org-11-activity-and-audit-log), [M1-08](finish-m1.md#m1-08-serve-the-web-app-from-the-backend-at-one-origin)

**Why.** Send someone a file without giving them an account.

**Outcome.** Create, list and revoke share links with expiry. A minimal public download page, access counts and audit events.

**Acceptance**

- A revoked or expired link returns the same response as an unknown link
- Public responses carry no session

**Checks:** `postgres`; `contract`; `web`; `rendered`

## ACC-05 Folder share links

`P3` · `M` · Build · Backend, Web · Public API change

Depends on: [ACC-04](#acc-04-file-share-links), [ORG-09](organize.md#org-09-download-a-folder-as-zip)

**Why.** Share a trip folder read-only.

**Outcome.** Read-only browsing of a shared subtree with ZIP download. Names outside the subtree never leak.

**Acceptance**

- Traversal outside the subtree is impossible (tests)

**Checks:** `postgres`; `contract`; `web`

## ACC-06 Decision: second user and roles

`P3` · `M` · Decision · Backend, Docs

Depends on: [M1-06](finish-m1.md#m1-06-prove-second-principal-isolation-over-http)

In flight: Unmerged branch `codex/run-authentik-and-the-local` adds OIDC sign-in through Authentik, which changes how a second user could arrive. Account for it.

**Why.** Isolation is already tested with a second principal. Invitations are the next step.

**Outcome.** Invitations without public registration, per-workspace roles (viewer, editor, owner) with no per-folder ACLs at first, and how sessions, CSRF and transfers change.

**Acceptance**

- Migration path from the single local owner

**Checks:** `decision-review`
