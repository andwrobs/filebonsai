# Pull request review

Filebonsai uses Codex's native GitHub Code Review integration as an additional review
pass. It is not a CI gate, a required approval, or a replacement for tests, branch
protection, and maintainer judgment.

The workflow has two distinct layers:

- **GitHub review:** Codex Cloud reads the pull request diff and applicable
  `AGENTS.md` guidance, then posts a standard GitHub review focused on consequential
  findings.
- **Pull request description:** the repository-local
  [filebonsai-pr skill](../../.agents/skills/filebonsai-pr/SKILL.md) prepares or
  refreshes the PR body and consolidates repository agent findings into its third
  top-level `Agent review` section.

Do not treat the PR description's `Agent review` section as a GitHub approval. Its
`Ready for maintainer review` assessment means only that no blocking issue was found
in the reviewed scope.

## External setup

A maintainer with access to the repository settings performs the external setup:

1. Sign in to [Codex Cloud](https://chatgpt.com/codex) with the ChatGPT account that
   will provide Codex usage.
2. Connect GitHub, authorize the Codex GitHub App, and grant it access to this
   repository. Organization policy may require an owner to approve the app.
3. Create a Codex Cloud environment for the repository when prompted.
4. Open [Codex Code Review settings](https://chatgpt.com/codex/settings/code-review)
   and enable Code Review for the repository.
5. Optionally enable automatic reviews. Configuring repository-wide automatic review
   requires the GitHub permissions shown by Codex, normally push or administration
   access.

Repository files cannot prove that the GitHub App remains installed or that Code
Review remains enabled. If the integration stops responding, verify those settings
before changing repository guidance.

This is the subscription-backed Codex Cloud integration. It does not require an
`OPENAI_API_KEY` or a GitHub Actions workflow. Adding `openai/codex-action` would be a
separate, API-billed CI integration and requires an explicit project decision.

## Request a review

When a pull request is ready for review, add this exact comment:

```text
@codex review
```

Codex should react with an eyes emoji and then publish its GitHub review. A one-off
request may narrow the review without changing durable repository guidance:

```text
@codex review for authorization, transaction, and workspace-isolation issues
```

After material revisions, request another review so its evidence matches the current
diff. Codex review findings are advisory; resolve or explicitly account for material
findings before marking the PR description `Ready for maintainer review`.

## Prepare or refresh the PR description

Ask a repository-aware Codex task to use the local skill:

```text
Use the filebonsai-pr skill to prepare or refresh the current PR description. Run the
relevant repository reviewers, consolidate their findings into the third section, and
update only the agent-review marker block when the rest of the description already
exists.
```

The skill preserves useful human-authored context and replaces only the marked agent
review block during a completed review refresh. Updating the live GitHub PR still
requires an explicit request; the skill does not authorize merging, approval, closing,
or code changes.

## Repository review guidance

Codex reads the `AGENTS.md` files that apply to changed paths. Put durable,
repository-wide rules in the root file and narrowly scoped rules in the nearest nested
file. Keep mechanical formatting and lint checks in CI.

Start with a small number of rules that describe a consequential unsafe behavior and
the safe path or exception. Refine them against representative pull requests rather
than adding speculative checks.

## Troubleshooting

If `@codex review` receives no response:

1. confirm Code Review is enabled for the repository in Codex settings;
2. confirm Codex Cloud has an environment for the repository;
3. confirm the GitHub App still has repository access;
4. use the exact `@codex review` trigger; and
5. for automatic reviews, confirm the selected trigger applies to the pull request.

The current product behavior and setup requirements are maintained in the
[official OpenAI GitHub review documentation](https://learn.chatgpt.com/docs/third-party/github)
and [Codex Cloud documentation](https://learn.chatgpt.com/docs/cloud).
