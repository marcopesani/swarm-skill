# Swarm Skill

A cross-platform agent plugin that helps Claude Code and Codex coordinate
parallel work on complex tasks.

## What it does

The `swarm` skill helps an agent decide when parallel work is useful, split a
task into independent workstreams, delegate through the host's available
subagent tools, and integrate and verify the results. It avoids delegation for
small tasks and keeps final decisions and verification with the coordinating
agent.

## Plugin layouts

This repository includes both current plugin entry points:

- Claude Code: `.claude-plugin/plugin.json`
- Codex and other Agent Plugins hosts: `plugin.json`

Both manifests load the same portable skill from `skills/swarm/SKILL.md`.

For local development, load this directory as a Claude Code plugin with
`claude --plugin-dir .`. In Codex, add this repository through the plugin
manager or a local plugin marketplace. Plugin availability and installation
flows can vary by host.
