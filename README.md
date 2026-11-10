<p align="center"><img src="assets/icon.png" width="96" alt="swarm"></p>

<h1 align="center">swarm</h1>

<p align="center">
  An <a href="https://agentskills.io">Agent Skill</a> that makes your coding agent the <b>lead</b> of a team of cheap
  <a href="https://pi.dev">pi</a> workers (OpenRouter models).<br>You plan, assign and judge. Workers do the bulk in
  their own git worktrees. A shared SQLite database is the only channel. Only work that builds and passes tests gets merged.
</p>

<p align="center">
  <a href="https://skills.sh/marcopesani/swarm-skill"><img alt="skills.sh" src="https://skills.sh/b/marcopesani/swarm-skill"></a>
  <a href="https://github.com/marcopesani/swarm-skill/actions/workflows/ci.yml"><img alt="ci" src="https://github.com/marcopesani/swarm-skill/actions/workflows/ci.yml/badge.svg"></a>
</p>

---

Use it for big work you can split up (many files, many tests, a migration), where one strong agent
doing everything costs too much. Before anything starts, the skill checks the OpenRouter key and
budget. It keeps credentials away from workers, audits every command they run, and gives each
worker only the skills its task needs.

> [!WARNING]
> Workers are **paid** and spend on their own, and they run shell commands **without a sandbox**.
> Run a swarm on a disposable machine (a cloud session or a VM), with an OpenRouter key that has
> a **credit limit**. The skill only starts when you ask for it by name.

## Install

The same `skills/swarm/` folder serves every host below. Pick the line for your agent.

### Any agent: `npx skills` ([skills.sh](https://skills.sh))

Works with Claude Code, Codex, pi, Cursor, OpenCode, Gemini CLI, GitHub Copilot and [75+ more](https://github.com/vercel-labs/skills/blob/main/docs/agents.md).

```bash
npx skills add marcopesani/swarm-skill                         # pick agents interactively
npx skills add marcopesani/swarm-skill -a claude-code -a codex -a pi -y
npx skills add marcopesani/swarm-skill -g                      # user-wide instead of this project
```

### Claude Code: plugin marketplace

```text
/plugin install swarm --marketplace marcopesani/swarm-skill
```

Or, in two steps: `/plugin marketplace add marcopesani/swarm-skill`, then `/plugin install swarm@swarm-skill`.
Run it with `/swarm:swarm <goal>` or `/swarm <goal>`.

### Codex / ChatGPT: plugin marketplace

```bash
codex plugin marketplace add marcopesani/swarm-skill
```

Then install **Swarm** from the plugin directory. Run it with `$swarm <goal>`.

To use the skill without a plugin, copy or link `skills/swarm` into `.agents/skills/` (repo) or `~/.agents/skills/` (user).
You can also ask `$skill-installer` to install it from `https://github.com/marcopesani/swarm-skill/tree/main/skills/swarm`.

### pi

```bash
pi install git:github.com/marcopesani/swarm-skill
```

Run it with `/skill:swarm <goal>`.

### claude.ai, Cowork, Claude cloud sessions, Skills API

Download `swarm.zip` from the [latest release](https://github.com/marcopesani/swarm-skill/releases/latest)
(or build it with `npm run package`), then upload it under **Settings → Capabilities → Skills**.

### Others

- [OpenSkills](https://github.com/numman-ali/openskills): `npx openskills install marcopesani/swarm-skill --universal`
- By hand: copy `skills/swarm/` into your agent's skills folder. The folder name must stay `swarm`.

## What you need

- An **OpenRouter API key** with a credit limit, in `OPENROUTER_API_KEY` or added by your
  environment's proxy. Below $5 left, the skill starts no workers.
- Nothing else. The lead installs what is missing: Node.js 22.18+ or 24.2+, curl, git, sqlite3 and the pi coding agent.

## How a run goes

1. **Setup.** The skill installs what is missing, checks the key and budget (`swarm budget`), and creates `~/.swarm` with its SQLite database.
2. **Plan.** It splits the goal into a tree of subtasks that don't overlap (one task, one set of files).
3. **Triage.** The first workers judge how hard each task is before they build.
4. **Spawn.** `swarm spawn` starts each worker in its own worktree. The worker gets a stripped
   environment, no MCP, and only the skills the lead picked (`swarm skills` lists which ones are portable).
5. **Run.** At each check-in the lead runs `swarm audit` on worker logs (privilege, secrets,
   network, push, leaving the worktree, tampering), checks the budget, and re-assigns work.
6. **Merge.** The lead reads every landed diff, runs the build and tests itself, and merges only what passes.
7. **Keep state.** It exports the database so a later session can pick the run back up.

See [`skills/swarm/SKILL.md`](skills/swarm/SKILL.md) for the full playbook.

## Repository layout

```text
skills/swarm/                    the skill: the single source for every host
├── SKILL.md                     Agent Skills frontmatter + the lead's playbook
├── agents/openai.yaml           Codex/ChatGPT: UI metadata, explicit-only invocation
├── scripts/swarm.mjs            budget, skills, spawn, audit (the rules that guard money and safety)
├── workers/AGENTS.md            team rules appended to every worker's system prompt
├── references/                  loaded on demand: skills for workers, persistence
└── assets/                      schema.sql (the shared database), icon
.claude-plugin/plugin.json       Claude Code plugin manifest
.claude-plugin/marketplace.json  Claude Code marketplace (this repo is one)
plugin.json                      Agent Plugins manifest (ChatGPT/Codex), with extensions.com.openai
.agents/plugins/marketplace.json Codex repo marketplace
package.json                     pi package (pi.skills) + dev tooling
tools/                           validate, package, sync-version
tests/                           node:test suite for scripts/swarm.mjs
```

### How it fits each spec

| Host / installer | Reads | Notes |
|---|---|---|
| [Agent Skills spec](https://agentskills.io/specification) | `skills/swarm/SKILL.md` | `name` matches the folder. Description ≤ 1024 chars, compatibility ≤ 500, `metadata` is all strings, `allowed-tools` is space-separated |
| [Claude Code](https://code.claude.com/docs/en/skills) | `.claude-plugin/*`, `skills/` | `disable-model-invocation: true`: Claude never starts it on its own |
| [Codex / ChatGPT](https://developers.openai.com/codex/skills) | `plugin.json`, `.agents/plugins/marketplace.json`, `agents/openai.yaml` | `policy.allow_implicit_invocation: false`: same rule as above |
| [pi](https://github.com/badlogic/pi-mono) | `package.json` → `pi.skills` | pi reads `disable-model-invocation` |
| [`npx skills`](https://github.com/vercel-labs/skills) | `skills/` (standard discovery) | Installs into `.agents/skills/` and symlinks into the other agents' folders. `swarm skills` follows those links |
| claude.ai / Skills API | `dist/swarm.zip` | Accepts only the 6 spec fields, so `npm run package` moves `disable-model-invocation` into `metadata` |

## Development

```bash
npm install
npm run validate    # spec + manifest checks (uses the reference validator, skills-ref)
npm test            # node:test suite, no network
npm run package     # dist/swarm.zip, the strict-spec build for claude.ai
claude plugin validate .
```

To release, run `npm version <patch|minor|major>` (it syncs the version into every manifest and
`SKILL.md`), then `git push --follow-tags`. CI publishes a GitHub release with `swarm.zip` attached.

## Credits

Adapted from the swarm skill in [bitrefill/devex](https://github.com/bitrefill/devex/tree/main/skills/swarm).
