# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Setup

```bash
git clone https://github.com/marcopesani/swarm-skill && cd swarm-skill
npm install
npm run check      # validate + test + package
```

You need Node.js 22.18+ or 24.2+, and `sqlite3` for the integration tests.

## Where things live

- `skills/swarm/` is the skill, and the only copy of it. Every installer and both plugin
  formats ship this folder.
- `skills/swarm/scripts/swarm.mjs` holds the rules that guard money, credentials and safety.
  Any change there needs a test in `tests/`. It must stay dependency-free, because it runs from
  wherever an installer puts it.
- `tools/manifests.mjs` generates every manifest (`plugin.json`, `.claude-plugin/*`,
  `.codex-plugin/*`, `.agents/plugins/*`). Edit it or `package.json`, never the generated
  files, then run `npm run sync`. `npm run validate` fails when they drift.

## Writing the skill

- Frontmatter: the six [Agent Skills](https://agentskills.io/specification) fields plus
  `disable-model-invocation`. Quote every `metadata` value.
- Keep `SKILL.md` under 500 lines. Move detail into `references/`.
- Write steps a model can follow without guessing: commands, expected output, what to do when they fail.

## Pull requests

- Add a line under `## [Unreleased]` in `CHANGELOG.md`.
- `npm run check` passes. If you have Claude Code, `claude plugin validate .` passes too.

## Releasing (maintainers)

Run the **release** workflow from the Actions tab and pick `patch`, `minor` or `major`. It
bumps the version everywhere, dates the changelog, tags, builds the zips, and publishes the GitHub
release. See [README → Releases](README.md#releases).
