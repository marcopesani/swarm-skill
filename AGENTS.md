# Working on this repository

This repo ships one Agent Skill, `skills/swarm/`, to every host: Claude Code, Codex/ChatGPT, pi,
`npx skills`, and claude.ai. Read [CONTRIBUTING.md](CONTRIBUTING.md). The rules that matter most:

- `skills/swarm/` is the only copy of the skill. Never copy it into `.claude/skills`,
  `.agents/skills` or `plugins/` here.
- Never edit the generated manifests (`plugin.json`, `.claude-plugin/*`, `.codex-plugin/*`,
  `.agents/plugins/*`) by hand. Edit `tools/manifests.mjs` or `package.json`, then run `npm run sync`.
- `SKILL.md` frontmatter holds the six Agent Skills fields plus `disable-model-invocation`.
  Quote every `metadata` value. Don't set versions by hand: the release workflow does it.
- `skills/swarm/scripts/swarm.mjs` guards money, credentials and safety. Every change needs a test
  in `tests/`. Keep it dependency-free.
- Add a line under `## [Unreleased]` in `CHANGELOG.md` for every user-visible change.
- Before you commit, `npm run check` must pass (and `claude plugin validate .` when Claude Code is installed).
