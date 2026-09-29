# Upstream provenance

Reviewed 2026-09-26 from `create-react-router@8.4.0`
(https://registry.npmjs.org/create-react-router/-/create-react-router-8.4.0.tgz).
SHA-256 of the unmodified originals:

- `package/dist/agent-skills/react-router/SKILL.md`:
  `a9b77003a8fc807dd894aa7aef2fb11f516ade90fbc73be81dd34cbc44df504f`
- `package/dist/agent-skills/react-router/references/framework-mode.md`:
  `3b1fc560fc816972688a44b1c1172b6fc774476909de3f2ad0889171e28bc9ac`

The MIT notice is in `../LICENSE.md`. This copy is adapted: mode detection and the
Data, Declarative, and RSC material are removed, and the examples use `src`, client
data APIs, TanStack Query, and static hosting. Don't present it as the official skill.

To refresh, unpack the matching release in a temporary directory, apply the relevant
changes without loosening the SPA rules, and update this file.

React Router's
[implement-rfc skill](https://github.com/remix-run/react-router/blob/main/.agents/skills/implement-rfc/SKILL.md)
is for changing the router itself, so it isn't installed.
