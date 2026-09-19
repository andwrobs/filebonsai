# Product design

## Active direction

Filebonsai should feel calm, warm, precise, and information-dense. Use ordinary file
language rather than gardening metaphors. The active visual reference is
[`design-references/library-direction.png`](design-references/library-direction.png):
a warm-white compact shell, restrained emerald actions, muted sage selection, thin
borders, a visible folder tree, coherent grid/table views, discoverable storage and
details, and purposeful mobile layouts. It is art direction, not proof of an
implemented screen or an exact component specification.

Raster logo explorations are not approved branding. Until editable marks, licenses,
and small-size checks exist, prefer a simple text identity and a coherent licensed
icon family.

## Required application surfaces

- Sign-in: owner login and actionable operator setup guidance without secret exposure.
- Library: navigation, breadcrumbs, search, view controls, upload/folder actions,
  selection, transfer access, and an optional inspector.
- Transfers: honest body, staging, finalization, reconciliation, availability,
  cancellation, expiry, and failure states. M1 retry explicitly says it restarts from
  byte zero.
- Storage: read-only configured connection, capability, and limit summary in M1; no
  browser credential or arbitrary endpoint editor.

Every implemented surface covers loading, empty, populated, long-name, many-item,
validation, not-found, unavailable, busy, and error states that apply to it. Mock-only
affordances are absent or clearly unavailable.

## Configurable shell requirement

The shell must eventually let people control which UI modules appear and where they
live. A theme switch does not satisfy this requirement. The active concept reference
is [`design-references/configurable-shell.png`](design-references/configurable-shell.png).

Start from a versioned declarative model with stable region/module IDs, capability-
aware visibility, constrained placement, useful presets, reversible edits, reset, and
validated import/export without credentials. Candidate regions are top bar, sidebar,
main content, inspector, and bottom tray. Candidate contexts are application default,
user, library, folder/saved view, device, and session.

Before implementation, decide precedence/inheritance, allowed placement and resizing,
device sync, schema migrations, hidden-control recovery, authorization of shared
defaults, accessibility, and the supported test matrix. Hiding a control never changes
backend permission. The concept image does not define an executable plugin system or
approved persistence schema.

## Interaction and inspection

- Inspect at 1440×900 and 390×844 at minimum, with deterministic realistic fixtures.
- Every action is keyboard reachable with visible/restored focus and a non-drag path.
- Respect reduced motion, contrast, screen-reader labels, touch targets, and useful
  progress announcements without noisy live regions.
- Distinguish hover, selection, focus, disabled, busy, pending, and error states.
- Pin fonts, browser/runtime, fixtures, viewport, time, and animation handling for
  screenshots. Visual diffs catch regressions; human/agent inspection judges quality.
- Generated mockups never count as the running product. Demo travel files, people,
  costs, routes, thumbnails, and documents are visibly synthetic.
