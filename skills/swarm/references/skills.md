# Handing skills to workers

A worker is a pi agent. pi follows the same Agent Skills spec
(agentskills.io) as Claude Code and Codex, so many of your skills work for it
unchanged. Giving a worker the right skill is
cheaper than explaining the method in the task text, and it is the same method
you would use yourself.

## What a worker can and cannot use

A worker has file, shell and edit tools. It has no MCP servers (spawn passes
`--no-mcp`), no web tools, and none of Claude Code's own tools (Skill, Agent,
Task, Artifact, AskUserQuestion, TodoWrite and the rest). A skill that relies on
those fails, or worse, tells the worker to call a tool that does not exist and
the worker improvises.

`swarm skills` looks where the common agents and installers put skills:
`~/.claude/skills` and `~/.claude/plugins` (Claude Code), `~/.agents/skills`
and `~/.config/agents/skills` (Codex, pi, Cursor and `npx skills`),
`~/.pi/agent/skills`, `~/.codex/skills`, `~/.codex/plugins`,
`/etc/codex/skills`, and `.claude/skills`, `.agents/skills`, `.pi/skills` from
the current folder up to the repository root. It follows symlinks (`npx skills`
links every agent's folder to one copy) and lists each skill once. Add other
places with `--root DIR`.

It marks each skill ✔ (portable) or ✘ with the reason, and
`swarm spawn` refuses a ✘ skill. The check reads the text, so it can refuse a
skill that only mentions such a tool. Then pick another skill or write the
method into the task.

## How to choose

- Give a task only the skills it needs: usually zero to two. Each skill costs
  the worker context on every turn it reads it.
- Good picks are method skills (test-driven development, systematic debugging,
  writing plans) and domain skills that match the code (a design system, a
  framework guide).
- Never pass skills that orchestrate other agents, commit, open PRs, push, or
  publish. Only you merge and push; a worker that does it breaks the review.
- Never pass a skill you have not read. A worker follows it without judgment.

## How it reaches the worker

`swarm spawn w1 --skill <folder> "<task>"` takes the folder `swarm skills`
printed, so two skills with the same name in different plugins never get mixed
up. It starts pi with `--no-skills` (so pi finds nothing on its own) and one
`--skill <folder>` per pick, and starts the task text with an instruction to
read those skills first. The skill names go into `assign.skills`, so you can
later see which worker had which skill.
