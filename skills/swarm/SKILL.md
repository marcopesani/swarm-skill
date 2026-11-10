---
name: swarm
description: Coordinate complex coding and research tasks by splitting independent work into parallel subagent workstreams, integrating their results, and verifying the outcome. Use when a task has multiple separable parts; do not use for small, sequential tasks.
---

# Swarm

Coordinate parallel agents only when doing so is likely to save time or improve
coverage. Keep ownership of the overall task, integration, and final
verification.

## Workflow

1. Understand the requested outcome, constraints, repository guidance, and
   available tools before delegating. Resolve important ambiguities first.
2. Keep straightforward or tightly coupled work in one agent. For a complex
   task, split it into a small number of bounded workstreams with clear
   deliverables, minimal overlap, and stated dependencies.
3. Use only subagent or delegation tools actually available in the current
   host. Give each delegate the relevant context, its scope, and whether it may
   edit files. Do not claim to have delegated when no such tool is available.
4. Prefer parallel investigation for independent questions. For changes to
   shared files, coordinate ownership or have delegates report recommendations
   for the coordinating agent to apply. Do not allow concurrent edits to
   overlapping files without an explicit coordination mechanism.
5. Review each result against the request and repository conventions. Resolve
   conflicts, check any proposed changes, and integrate only the work that is
   relevant and correct.
6. Run appropriate tests and checks after integration. Report what was
   delegated, what was completed, and any remaining uncertainty or failed
   checks.

## Guardrails

- Follow the user's scope and all higher-priority instructions. Delegation does
  not grant permission to take actions the user did not authorize.
- Preserve existing user changes and avoid destructive or irreversible actions.
- Do not pass secrets or unnecessary sensitive data to delegates.
- Treat delegate output as unverified: inspect changes and independently
  validate important claims before relying on them.
