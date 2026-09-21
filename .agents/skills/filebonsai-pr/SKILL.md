---
name: filebonsai-pr
description: Create or update concise, product-oriented Filebonsai pull request descriptions and consolidate repository-specific agent reviews into the PR body. Use when opening, reviewing, or refreshing a Filebonsai PR.
---

# Filebonsai pull requests

Make the pull request useful to the maintainer and understandable to outside developers. Keep it proportional to the change; do not add process theater or empty sections.

## Gather context

Before drafting or updating the description, inspect the available:

- PR diff and commits;
- linked issue, when present;
- relevant product, architecture, API, and decision documents;
- verification results and CI state;
- existing PR description, preserving useful human-authored context.

Do not describe planned verification as completed or infer evidence from code alone.

## Description structure

Use this order. `Agent review` must remain the third top-level section.

```markdown
## Summary

[State the product outcome, observable behavior, and why the change matters. Keep this concise.]

## Background

[Explain only the product or technical context needed to understand the change and its approach.]

<!-- agent-review:start -->
## Agent review

**Assessment:** [Pending | Changes needed | Ready for maintainer review]

- **Evidence:** [Checks, scenarios, rendered inspection, measurements, or CI results actually observed.]
- **Findings:** [Blocking or important findings. Say “No blocking findings” when appropriate.]
- **Remaining risk:** [Missing proof, deferred behavior, platform limitations, or “None identified.”]
<!-- agent-review:end -->

<details>
<summary><strong>Notes</strong></summary>

[Include deeper implementation details, measurements, behavior intentionally left unchanged, or possible follow-up work only when useful.]

</details>
```

Remove the collapsed `Notes` block when there is no useful additional detail. Do not create empty subsections inside it.

## Writing guidance

### Summary

Lead with the user, operator, or contributor capability—not a file list.

Include the important behavior and motivation. For internal engineering work, explain which product guarantee or future capability it enables.

### Background

Supply the mental model needed to review the change. Relevant context may include:

- lifecycle or state-machine behavior;
- authorization and workspace boundaries;
- transaction or storage semantics;
- API and generated-client relationships;
- platform-specific behavior;
- the observed failure or performance constraint.

Do not repeat the summary or turn this into general documentation.

### Agent review

The primary agent owns the final consolidated review.

Use the general reviewer for meaningful code changes. Add specialized review when the changed guarantee warrants it:

- contract review for controllers, public DTOs, OpenAPI, or generated clients;
- persistence review for database, migration, authentication, authorization, storage, transactions, concurrency, or recovery.

Deduplicate findings from multiple reviewers. Report only information that could affect correctness, security, compatibility, evidence, maintainability, or the merge decision.

The assessment meanings are:

- `Pending`: review or required evidence is incomplete.
- `Changes needed`: at least one material issue should be addressed before merge.
- `Ready for maintainer review`: no blocking issue was found in the reviewed scope; this is not an approval or authorization to merge.

Evidence must say what was actually observed. If a relevant check could not run, state that directly and explain whether CI covers it.

Keep findings prioritized and concise. Avoid generic praise, style preferences, speculative refactors, and summaries already present above.

### Notes

Use collapsed Notes for detail that is valuable but not necessary for the first read, such as:

- exact implementation mechanics;
- benchmark tables or environment details;
- additional validation evidence;
- behavior intentionally not changed;
- compatibility details;
- possible follow-up work.

Allow the amount of detail to grow with the risk or complexity of the change.

## Updating an existing PR

Preserve useful human-authored `Summary`, `Background`, and `Notes` content.

When refreshing a completed review, replace only the content between:

```text
<!-- agent-review:start -->
<!-- agent-review:end -->
```

Do not overwrite the rest of the PR body merely to normalize wording.

When explicitly asked to update the live GitHub PR, inspect the final body before posting it. Do not approve, merge, close, or modify code unless separately requested.
