# Working on this repository

This repo ships one Agent Skill, `skills/swarm/`, to several hosts. Keep that folder the single
source: never copy the skill into `.claude/skills`, `.agents/skills` or a `plugins/` folder here.

- `skills/swarm/SKILL.md` frontmatter: the six Agent Skills fields plus `disable-model-invocation`.
  Don't add other host-only fields without adding them to `HOST_FIELDS` in `tools/lib.mjs`.
  `metadata` values must be quoted strings.
- `skills/swarm/scripts/swarm.mjs` holds the rules that guard money, credentials and safety. Every
  change there needs a test in `tests/swarm.test.mjs`. It has no dependencies: keep it that way,
  because it runs from wherever an installer put it.
- Versions: don't edit them by hand. `npm version <patch|minor|major>` syncs `package.json`,
  both `plugin.json` files and `metadata.version` in `SKILL.md`.
- Before you commit, run `npm run check` (validate, test, package), and `claude plugin validate .`
  when Claude Code is installed.
