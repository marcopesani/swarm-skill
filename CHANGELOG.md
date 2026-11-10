# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-11-11

### Added

- A standalone, MIT-licensed repository for the swarm skill. Install it with `npx skills`
  (skills.sh), the Claude Code plugin marketplace, the Codex plugin marketplace, or `pi install`.
- Release assets: `swarm-skill.zip`, which passes the strict Agent Skills spec (claude.ai, Cowork,
  Claude Skills API, or unzipped into any agent's skills folder), and `swarm-plugin.zip`, which carries the Agent Plugins,
  Claude Code and Codex manifests (OpenAI plugin portal, Codex desktop, `claude --plugin-url`).
  Both zips are deterministic, and the release lists them in `SHA256SUMS` with build provenance.
- Codex: `agents/openai.yaml`, with `allow_implicit_invocation: false`. The plugin also sets
  `requires_local_executor`.
- `swarm skills` searches the Agent Skills locations (`.agents/skills`, `~/.agents/skills`,
  `~/.config/agents/skills`), pi's and Codex's folders, and project folders from cwd up to the repo
  root. It follows the symlinks `npx skills` creates, lists each skill once, and names plugin skills
  from Agent Plugins and Codex manifests too.
- `swarm audit` flags access to `~/.codex/`.
- Unit and integration tests for the workbench, with a stub pi for `spawn`. A validator for the
  spec, every manifest and OpenAI's listing limits. One generator for all manifests.

### Changed

- `disable-model-invocation` is now a top-level `SKILL.md` field, so Claude Code and pi honour it.
  As `metadata.disable-model-invocation` it had no effect.
- `allowed-tools` is space-separated, as the spec asks. `schema.sql` moved to `assets/`.
- `SKILL.md` no longer assumes one company's stack. Worktree setup, network hosts and lead-only
  work (specs, the live app, the final review) are now written for any repo. The concrete pnpm +
  submodules + in-memory MongoDB setup moved to `references/worktree-setup.md` as a worked example.

[Unreleased]: https://github.com/marcopesani/swarm-skill/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/marcopesani/swarm-skill/releases/tag/v1.0.0
