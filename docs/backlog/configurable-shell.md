# Configurable shell

Same app, your layout: modules, regions, presets and per-folder views, without affecting permissions or losing the way back.

design.md requires real configurability and says a theme switch doesn't count. Start with the unresolved schema decision (precedence, persistence, migration, recovering hidden controls), then build a module registry with three presets before adding drag-to-customize.

Keep three boundaries explicit: server capabilities describe what this installation
and viewer can do (CFG-09); preferences store how a viewer wants to work (CFG-04);
owner administration changes approved operational settings (CFG-11 and TIER-10–15).
Spring configuration still bootstraps infrastructure and sets deployment guardrails.
None of these APIs is a generic editor for Spring properties, environment variables,
arbitrary CSS, JavaScript or provider secrets. The shapes below are candidates for
code-first Java contracts, not an approved endpoint/schema specification.

See [the backlog index](README.md) for how to pick up and retire items.

## CFG-01 Decision: configurable shell model

`P2` · `M` · Decision · Web, Docs

Depends on: none

**Why.** status.md lists this as unresolved, and design.md sets the requirements.

**Outcome.** A versioned layout document (regions: top bar, sidebar, main, inspector, bottom tray; modules with stable IDs). Decide precedence among application defaults, owner-provided workspace defaults, personal preferences, folder/saved-view overrides, device constraints and session edits. Distinguish fallback defaults from enforced limits; a phone's layout constraints and server permissions are not user overrides. Cover sizing, sync, migration, hidden-control recovery, shared-default authorization and import/export validation.

**Acceptance**

- Answers every open question listed in design.md
- Includes three preset definitions
- Work through a wide-screen inspector on a phone, a missing module after an upgrade, a corrupt import, two devices editing together and a workspace change; the user can always reach navigation and Reset
- Specify which settings sync (preset, density, chosen modules) and which stay device-local (transient panel size/open state); no stored credentials, session material or privileged configuration

**Read:** `docs/product/design.md`, `docs/product/design-references/configurable-shell.png`  
**Checks:** `decision-review`

## CFG-02 Module registry and layout engine

`P2` · `L` · Build · Web

Depends on: [CFG-01](#cfg-01-decision-configurable-shell-model), [LIB-01](everyday-library.md#lib-01-design-tokens-and-shell-foundation)

**Why.** The first real configurability.

**Outcome.** A registry of modules with capability-aware visibility, a region renderer, presets (Quiet Library, Precision Workspace, Media Gallery), local persistence, and reset.

**Acceptance**

- Hiding a module never changes backend permissions
- Reset is always reachable

**Checks:** `web`; `rendered`

## CFG-03 Customize Layout panel

`P3` · `M` · Build · Web · Fun

Depends on: [CFG-02](#cfg-02-module-registry-and-layout-engine)

**Why.** This is the panel from the concept reference.

**Outcome.** Toggle modules, move them between regions with menus (the non-drag path) or by dragging, preview live, and use Reset, Done and undo.

**Acceptance**

- Keyboard-only customization works
- Invalid placements prevented, not just warned about
- Group Appearance, Visible panels and Arrangement with useful descriptions; distinguish inherited values from explicit overrides and make reset scope clear
- Preview and Cancel restore the prior layout; saving has visible pending/error feedback; drawer/sheet controls remain reachable with zoom and the virtual keyboard

**Checks:** `web`; `rendered`

## CFG-04 Preferences API

`P2` · `M` · Build · Backend · Public API change

Depends on: [CFG-01](#cfg-01-decision-configurable-shell-model)

**Why.** Layouts that follow you between devices need the server.

**Outcome.** Typed, versioned preferences for preset, density, view mode and permitted panel choices, scoped to the authenticated principal and to the current workspace where applicable. Read, update and reset have explicit revision checks; device-scoped values stay local. Start with supported personal settings; shared workspace defaults need their own authorized owner operation.

**Acceptance**

- Schema migration path tested
- Principal-scoped
- A second device cannot silently overwrite a newer revision; conflict responses let the UI reload and reapply its edits; reset follows the same concurrency rule
- Bound document size, nesting, list lengths and supported values; reject unknown request fields, executable content and module/region combinations the schema does not support
- Logout/workspace changes clear scoped caches; a failed fetch uses safe defaults without overwriting saved preferences, and a failed write never claims to have synced
- CSRF protects mutations; PostgreSQL tests cover two principals, two workspaces, concurrent updates and reset; generated TypeScript/Swift clients decode defaults and migrated documents

**Invariants:** INV-01, INV-11

**Checks:** `postgres`; `contract`

## CFG-05 Per-folder view settings

`P3` · `M` · Build · Web, Backend

Depends on: [CFG-04](#cfg-04-preferences-api), [LIB-03](everyday-library.md#lib-03-server-side-sort-for-folder-listings), [LIB-04](everyday-library.md#lib-04-table-and-grid-views)

**Why.** /Photos wants a gallery and /Taxes wants a table.

**Outcome.** Per-folder view mode, sort, density, and 'open as Media Gallery', with 'Inherit from parent'.

**Acceptance**

- Inheritance tested
- Moving a folder keeps its own settings

**Checks:** `contract`; `web`; `rendered`

## CFG-06 Layout import and export

`P3` · `S` · Build · Web

Depends on: [CFG-02](#cfg-02-module-registry-and-layout-engine)

**Why.** Share a setup or keep a backup of it.

**Outcome.** JSON import and export with schema validation and version migration, and no credentials. Folder-scoped settings that reference entry IDs are omitted or flagged.

**Acceptance**

- Hostile imports are rejected with clear errors

**Checks:** `web`

## CFG-07 Saved views (smart folders)

`P3` · `M` · Build · Web, Backend · Public API change · Fun

Depends on: [LIB-07](everyday-library.md#lib-07-name-search), [ORG-08](organize.md#org-08-tags)

**Why.** Filters you use every week should be one click away.

**Outcome.** Save a search or filter (tags, type, date, size, archived) as a sidebar view that also works as a Tidy deck and a layout scope.

**Acceptance**

- Views are principal-scoped
- A broken filter degrades gracefully

**Checks:** `postgres`; `contract`; `web`

## CFG-08 Operator configuration reference

`P3` · `S` · Build · Backend, Docs

Depends on: none

**Why.** Configuration settings are scattered across local-setup.md and examples.

**Outcome.** Generate an operator reference from Spring configuration metadata, with an explicit allow-list of documented properties and safe synthetic examples. Classify deployment-only settings, runtime owner settings and personal preferences; document ownership, precedence and restart requirements. Runtime summaries belong to CFG-09/CFG-11 rather than exposing Spring's environment or configuration beans.

**Acceptance**

- Generated, not hand-edited
- Secret-valued properties never rendered
- No runtime values, secret-reference paths or internal endpoints in generated examples; name-based secret redaction alone is insufficient
- Explain config-managed versus app-managed connections and how existing installations migrate without startup overwriting app edits (TIER-10/TIER-03)

**Invariants:** INV-11  
**Checks:** `backend`

## CFG-09 Runtime UI capabilities API

`P2` · `M` · Build · Backend, Web · Public API change

Depends on: none

**Why.** The sign-in page currently depends on `VITE_FILEBONSAI_OIDC`, and other screens need authoritative capabilities without exposing server configuration or rebuilding the web bundle.

**Outcome.** A minimal public sign-in descriptor and a separate authenticated UI-capability response. The public shape reveals only enabled sign-in methods and same-origin sign-in routes. The authenticated shape supplies stable feature IDs, allowed viewer actions and implemented module IDs. Keep existing upload-limits/storage endpoints authoritative; reference or deliberately compose their application services instead of creating competing values.

**Acceptance**

- One built web bundle works with local-owner sign-in alone or configured Authentik; no issuer/client secret, account, bucket, endpoint, path, property dump or membership details appear in the public response
- Derive capabilities from supported code, effective policy and authenticated authorization; hidden controls do not grant/deny API permission, and stale UI capabilities never bypass server checks
- Unknown response feature IDs degrade safely; missing/unavailable discovery has an explicit recovery state and never enables a privileged control by default
- Authenticated responses use `no-store`; clear caches on login/logout/workspace change; public discovery cannot vary with a supplied username or reveal account existence
- Java DTOs author the contract; generated clients compile and decode representative enabled, disabled and unknown-feature responses; PostgreSQL-backed HTTP tests prove public/private separation
- Names, versioning, refresh behavior and error semantics are settled before implementation; no arbitrary server-authored forms or executable module definitions

**Invariants:** INV-01, INV-11

**Read:** `docs/api/conventions.md`, `docs/api/openapi-codegen.md`

**Checks:** `postgres`; `contract`; `web`; `rendered` for sign-in and capability-driven controls

## CFG-10 Personal settings and sync feedback

`P2` · `M` · Build · Web

Depends on: [CFG-02](#cfg-02-module-registry-and-layout-engine), [CFG-04](#cfg-04-preferences-api), [CFG-09](#cfg-09-runtime-ui-capabilities-api), [LIB-16](everyday-library.md#lib-16-storage-summary-and-explanatory-panels)

**Why.** A preferences endpoint needs an understandable place to change settings and know whether they saved.

**Outcome.** A personal Settings surface for supported view/density/preset choices, with concise descriptions, live previews, reset and clear device-only versus synced labels. The Customize Layout panel remains CFG-03; both use one preference model and service.

**Acceptance**

- Display effective values and whether inherited or overridden; explain reset scope before applying it
- Pending, saved, offline/unavailable, validation and revision-conflict states preserve edits and offer a specific recovery action; do not claim sync until acknowledged
- Returning after sign-in restores the right viewer's preferences; another account/workspace never inherits cached private settings
- Render normal, long-label, empty/unsupported, failed-load and failed-save states at desktop/phone widths, 200% zoom and with keyboard navigation

**Checks:** `web`; `rendered`

## CFG-11 Decision: owner settings and deployment guardrails

`P2` · `M` · Decision · Backend, Web, Docs

Depends on: none

**Why.** Editing every Spring property in a browser would expose infrastructure and let presentation preferences change server safety limits.

**Outcome.** A setting-by-setting ownership matrix and proposed typed administration API. Recommend Spring/secret mounts for database, bind/TLS/proxy trust, identity-provider trust, local roots, encryption-root delivery and hard resource ceilings. Consider app-managed workspace defaults and soft upload limits within those ceilings. Storage credentials and connections follow TIER-10 rather than a generic settings map.

**Acceptance**

- Distinguish default, enforced ceiling and app override with one effective-value rule; restart cannot silently reset an app-managed value
- Specify owner authorization, recent reauthentication for sensitive changes, CSRF, revision conflict, safe audit fields and when a change affects in-flight operations
- A lower upload limit does not strand an accepted transfer; a raised value cannot exceed measured provider/deployment limits; the existing upload-limits API reports the same enforced result
- List what applies immediately, requires draining, or requires an operator restart; no property-name pass-through, public actuator environment access or arbitrary path/endpoint editor
- Propose bounded implementation items only after the decision is reviewed; do not change current runtime settings in this task

**Read:** `docs/architecture/storage-and-transfers.md`, `docs/api/conventions.md`

**Checks:** `decision-review`
