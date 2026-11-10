<p align="center"><img src="assets/icon.png" width="96" alt=""></p>

<h1 align="center">swarm</h1>

<p align="center">
  An <a href="https://agentskills.io">Agent Skill</a> that makes your coding agent the <b>lead</b> of a team of cheap
  <a href="https://pi.dev">pi</a> workers running OpenRouter models.<br>
  You plan, assign and judge. Workers build in their own git worktrees, a shared SQLite database is the only
  channel, and only work that builds and passes tests gets merged.
</p>

<p align="center">
  <a href="https://github.com/marcopesani/swarm-skill/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/marcopesani/swarm-skill/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/marcopesani/swarm-skill/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/marcopesani/swarm-skill?sort=semver"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <a href="https://skills.sh/marcopesani/swarm-skill"><img alt="skills.sh" src="https://skills.sh/b/marcopesani/swarm-skill"></a>
  <a href="https://agentskills.io/specification"><img alt="Agent Skills spec" src="https://img.shields.io/badge/Agent%20Skills-spec-orange"></a>
</p>

---

Use it for big work you can split up: a migration, many files, many tests. One strong agent doing
all of that costs too much. Before anything starts, the lead checks your OpenRouter key and budget.
It keeps credentials away from workers, audits every command they ran, gives each worker only the
skills its task needs, and merges only what it has built and tested itself.

> [!WARNING]
> Workers are **paid** and spend on their own, and they run shell commands **without a sandbox**.
> Run a swarm on a disposable machine (a cloud session or a VM), with an OpenRouter key that has a
> **credit limit**. The skill never starts on its own: you have to ask for it by name.

## Install

Every host below gets the same `skills/swarm/` folder.

| Agent | Install | Run |
|---|---|---|
| **Any agent** (Claude Code, Codex, pi, Cursor, OpenCode, Gemini CLI, Copilot, [75+ more](https://github.com/vercel-labs/skills/blob/main/docs/agents.md)) | `npx skills add marcopesani/swarm-skill` | depends on the agent |
| **Claude Code** | `/plugin install swarm --marketplace marcopesani/swarm-skill` | `/swarm <goal>` |
| **Codex** CLI / app | `codex plugin marketplace add marcopesani/swarm-skill`<br>`codex plugin add swarm@swarm-skill` | `$swarm <goal>` |
| **pi** | `pi install git:github.com/marcopesani/swarm-skill` | `/skill:swarm <goal>` |
| **claude.ai**, Cowork, Claude Skills API | upload [`swarm-skill.zip`](https://github.com/marcopesani/swarm-skill/releases/latest/download/swarm-skill.zip) under *Settings → Capabilities → Skills* | ask for a swarm by name |

<details>
<summary>More options: one-off loads, manual installs, other installers</summary>

```bash
# npx skills: pick agents, user-wide, non-interactive
npx skills add marcopesani/swarm-skill -a claude-code -a codex -a pi -g -y

# Claude Code: marketplace in two steps, or one session from the release zip
/plugin marketplace add marcopesani/swarm-skill
/plugin install swarm@swarm-skill
claude --plugin-url https://github.com/marcopesani/swarm-skill/releases/latest/download/swarm-plugin.zip

# Codex without a plugin: drop the skill into the Agent Skills folder
curl -fsSL https://github.com/marcopesani/swarm-skill/releases/latest/download/swarm-skill.zip -o /tmp/swarm.zip
unzip -o /tmp/swarm.zip -d ~/.agents/skills

# OpenSkills
npx openskills install marcopesani/swarm-skill --universal
```

Codex can also install it with `$skill-installer https://github.com/marcopesani/swarm-skill/tree/main/skills/swarm`.
To install by hand, copy `skills/swarm/` into your agent's skills folder. The folder must stay named `swarm`.
</details>

## Quick start

1. Get an [OpenRouter API key](https://openrouter.ai/settings/keys), **set a credit limit on it**, and export it:
   `export OPENROUTER_API_KEY=sk-or-…`
2. Open your agent in the repository you want to change and ask for a swarm by name:

   ```text
   /swarm Migrate every test in packages/api from Jest to Vitest. Keep coverage the same.
   ```

3. The lead installs whatever is missing (Node.js 22.18+, curl, git, sqlite3, pi), checks the
   budget, plans the subtasks, starts 2–3 workers, and reports back as their work lands.

## How a run goes

```text
       you ──► lead (Claude Code / Codex / pi)
                │  plan · assign · audit · review · merge
                ▼
         ~/.swarm/swarm.db  ◄──── announce · assign · notes · subtasks · landed
          ▲      ▲      ▲
          w1     w2     w3     pi workers (OpenRouter), one git worktree + branch each
```

1. **Setup.** The lead installs what is missing and runs `swarm budget`: the key must work, have
   a limit, and have at least $5 left.
2. **Plan.** It splits the goal into a tree of subtasks that don't collide (one task, one set of files).
3. **Triage.** The first workers judge how hard each task is before they build.
4. **Spawn.** `swarm spawn` starts a pi worker in its own worktree. The worker gets a stripped
   environment, no MCP, no startup network calls, and only the skills the lead picked.
5. **Run.** At each check-in the lead runs `swarm audit` on the worker logs. It flags privilege,
   secrets, network, push, leaving the worktree, and tampering. It also checks the budget and reassigns work.
6. **Merge.** The lead reads every landed diff, runs the build and tests itself, and merges only what passes.
7. **Keep state.** It exports the database, so a later session can pick the run back up.

The full playbook is [`skills/swarm/SKILL.md`](skills/swarm/SKILL.md).

## Compatibility

| Host / format | What it reads | Notes |
|---|---|---|
| [Agent Skills spec](https://agentskills.io/specification) | `skills/swarm/SKILL.md` | Checked with the reference validator `skills-ref` |
| [Claude Code](https://code.claude.com/docs/en/skills) | `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` | `disable-model-invocation: true`: Claude never starts it on its own |
| [Codex / ChatGPT](https://developers.openai.com/codex/skills) | `plugin.json` ([Agent Plugins](https://agent-plugins.org) + `extensions.com.openai`), `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `agents/openai.yaml` | `allow_implicit_invocation: false`, `requires_local_executor: true` |
| [pi](https://pi.dev) | `package.json` → `pi.skills` | pi honours `disable-model-invocation` |
| [`npx skills`](https://github.com/vercel-labs/skills) | `skills/` | Installs into `.agents/skills/` and symlinks into the other agents' folders. `swarm skills` follows those links |
| claude.ai / Skills API | `swarm-skill.zip` | They accept only the six spec fields, so the build moves `disable-model-invocation` into `metadata` |

## Releases

Each [release](https://github.com/marcopesani/swarm-skill/releases) has:

| Asset | Contents | For |
|---|---|---|
| `swarm-skill.zip` | `swarm/` with strict-spec frontmatter | claude.ai, Cowork, Claude Skills API; unzip into any skills folder |
| `swarm-plugin.zip` | `plugin.json`, `.claude-plugin/`, `.codex-plugin/`, `skills/`, `assets/` | OpenAI plugin portal upload, Codex desktop, `claude --plugin-dir/--plugin-url` |
| `SHA256SUMS` | checksums | `sha256sum -c SHA256SUMS --ignore-missing` |

The zips are deterministic and carry [build provenance](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations):
`gh attestation verify swarm-plugin.zip --repo marcopesani/swarm-skill`.

To cut a release, open **Actions → release → Run workflow** and pick `patch`, `minor` or `major`.
The workflow bumps the version in every manifest and in `SKILL.md`, dates `CHANGELOG.md`, runs all
checks, installs the plugin in Claude Code and Codex, tags, pushes, and publishes. Pushing a
`vX.Y.Z` tag by hand works too.

## Repository layout

```text
skills/swarm/                     the skill: the only copy, shipped to every host
├── SKILL.md                      frontmatter + the lead's playbook
├── agents/openai.yaml            Codex/ChatGPT: UI metadata, explicit-only invocation
├── scripts/swarm.mjs             budget · skills · spawn · audit (rules that guard money and safety)
├── workers/AGENTS.md             team rules appended to every worker's system prompt
├── references/                   loaded on demand: skills for workers, persistence
└── assets/                       schema.sql (the shared database), icon
plugin.json                       Agent Plugins manifest (OpenAI)            ┐
.claude-plugin/                   Claude Code plugin + marketplace           │ generated by
.codex-plugin/plugin.json         Codex compatibility manifest              │ tools/manifests.mjs
.agents/plugins/marketplace.json  Codex marketplace                          ┘
package.json                      pi package + dev scripts
tools/                            validate · package · manifests · changelog · release-notes
tests/                            unit + end-to-end tests (stub pi)
```

## Development

```bash
npm install
npm run check        # validate + test + package
npm run sync         # regenerate manifests after editing package.json or tools/manifests.mjs
claude plugin validate .
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Adapted from the swarm skill in Bitrefill's devex toolkit.
