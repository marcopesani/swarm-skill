# Changelog

## [1.0.0] - 2026-11-11

- First release as a standalone repository, installable through `npx skills`, the Claude Code
  plugin marketplace, the Codex plugin marketplace, `pi install` and a claude.ai upload zip.
- `SKILL.md`: `disable-model-invocation` is now a top-level field, so Claude Code and pi honour it
  (as `metadata.disable-model-invocation` it had no effect). `allowed-tools` is space-separated, as
  the spec asks. `schema.sql` moved to `assets/`.
- Codex: `agents/openai.yaml` with `allow_implicit_invocation: false`.
- `swarm skills` now also searches the Agent Skills locations (`.agents/skills`, `~/.agents/skills`,
  `~/.config/agents/skills`), pi's and Codex's folders, and project folders from cwd up to the repo root.
  It follows the symlinks `npx skills` creates, lists each skill only once, and names plugin skills
  from Agent Plugins and Codex manifests too.
- `swarm audit` flags access to `~/.codex/`.
- A test suite for the workbench, plus a validator for the spec and all four manifests.
