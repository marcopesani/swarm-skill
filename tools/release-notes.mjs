#!/usr/bin/env node
// The GitHub release body: this version's changelog section, then how to install each asset.
//
//   node tools/release-notes.mjs [version]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { section } from './changelog.mjs';
import { ROOT, readJson } from './lib.mjs';

const pkg = readJson('package.json');
const version = process.argv[2] ?? pkg.version;
const repo = pkg.homepage.replace(/#.*$/, '').replace('https://github.com/', '');
const notes = section(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'), version);
if (notes === null) {
    console.error(`✘ CHANGELOG.md has no section for ${version}`);
    process.exit(1);
}
const dl = `https://github.com/${repo}/releases/download/v${version}`;

console.log(`${notes}

## Install

| Where | How |
|---|---|
| Any agent ([skills.sh](https://skills.sh)) | \`npx skills add ${repo}\` |
| Claude Code | \`/plugin install swarm --marketplace ${repo}\` |
| Claude Code, this exact build | \`claude --plugin-url ${dl}/swarm-plugin.zip\` |
| Codex CLI / app | \`codex plugin marketplace add ${repo}\`, then \`codex plugin add swarm@swarm-skill\` |
| pi | \`pi install git:github.com/${repo}@v${version}\` |
| claude.ai, Cowork, Claude Skills API | upload **swarm-skill.zip** |
| Codex / ChatGPT desktop, any agent, by hand | unzip **swarm-skill.zip** into \`~/.agents/skills/\` (or your agent's skills folder) |
| OpenAI plugin portal, Codex desktop (manual) | upload or unpack **swarm-plugin.zip** |

## Assets

- **swarm-skill.zip**: the skill alone (\`swarm/SKILL.md\` at the top), limited to the six Agent Skills frontmatter fields.
- **swarm-plugin.zip**: the plugin, with \`plugin.json\` (Agent Plugins, OpenAI), \`.claude-plugin/plugin.json\` and \`.codex-plugin/plugin.json\` at the top and \`skills/swarm/\` beside them.
- **SHA256SUMS**: checksums. The zips are reproducible: \`npm ci && npm run package\` at tag \`v${version}\` on Node.js 24 rebuilds the same bytes.

Verify a download:

\`\`\`bash
sha256sum -c SHA256SUMS --ignore-missing
gh attestation verify swarm-plugin.zip --repo ${repo}
\`\`\``);
