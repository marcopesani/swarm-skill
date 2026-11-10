# Security policy

Swarm starts paid AI workers that run shell commands on your machine. Its safety rules live in
`skills/swarm/scripts/swarm.mjs`: the budget gate, the stripped worker environment, the skill
portability check and the log audit. A flaw in any of these counts as a security issue.

## Supported versions

Only the latest release gets fixes.

## Report a vulnerability

Please **do not open a public issue**. Report it privately through
[GitHub's private vulnerability reporting](https://github.com/marcopesani/swarm-skill/security/advisories/new).

Include what you found, how to reproduce it, and its impact (for example: a credential reaches a
worker, a worker starts below the budget floor, or the audit misses a push or a privilege escalation).
You should get a reply within 7 days. Once a fix ships, you are credited in the advisory, unless you ask not to be.

## Out of scope

Swarm itself says workers are not sandboxed, and that a swarm should run on a disposable machine
(`SKILL.md`, step 0). Workers being able to run commands is the design, not a vulnerability.
Ways around the audit or the credential stripping are in scope.
