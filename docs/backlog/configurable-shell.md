# Configurable shell

Same app, your layout: modules, regions, presets and per-folder views, without affecting permissions or losing the way back.

design.md requires real configurability and says a theme switch doesn't count. Start with the unresolved schema decision (precedence, persistence, migration, recovering hidden controls), then build a module registry with three presets before adding drag-to-customize.

See [the backlog index](README.md) for how to pick up and retire items.

## CFG-01 Decision: configurable shell model

`P2` · `M` · Decision · Web, Docs

Depends on: none

**Why.** status.md lists this as unresolved, and design.md sets the requirements.

**Outcome.** A versioned layout document (regions: top bar, sidebar, main, inspector, bottom tray; modules with stable IDs). It covers placement constraints and sizing, precedence (app default < user < library < folder or saved view < device < session), synced vs device persistence, schema migration, recovering hidden controls, authorization of shared defaults, import and export validation, and the test matrix.

**Acceptance**

- Answers every open question listed in design.md
- Includes three preset definitions

**Read:** `docs/product/design.md`, `docs/product/design-references/configurable-shell.png`  
**Checks:** `decision-review`

## CFG-02 Module registry and layout engine

`P2` · `L` · Build · Web

Depends on: [CFG-01](#cfg-01-decision-configurable-shell-model)

Context: LIB-01/LIB-10 added the responsive shell: tokens in `web/app/styles/tokens.css` (raw colors anywhere else fail `tokens.test.ts`), Lucide icons, and the `routes/app-shell.tsx` layout route with sidebar, icon rail and bottom navigation. Regions are fixed CSS today; the registry replaces them rather than adding a second layout system.

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

**Checks:** `web`; `rendered`

## CFG-04 Preferences API

`P3` · `M` · Build · Backend · Public API change

Depends on: [CFG-01](#cfg-01-decision-configurable-shell-model)

**Why.** Layouts that follow you between devices need the server.

**Outcome.** Per-principal preference documents validated against a versioned schema on the server, with size limits and revision checks. Device-scoped values stay local.

**Acceptance**

- Schema migration path tested
- Principal-scoped

**Invariants:** INV-01  
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

**Outcome.** Generate a configuration reference from Spring configuration metadata, plus a read-only summary of effective settings for the owner (non-secret values only).

**Acceptance**

- Generated, not hand-edited
- Secret-valued properties never rendered

**Invariants:** INV-11  
**Checks:** `backend`
