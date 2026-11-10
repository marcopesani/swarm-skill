#!/usr/bin/env node
// One source for every distribution manifest. Identity (version, description, license, author,
// keywords) comes from package.json; listing copy lives below. `npm run sync` writes the files,
// `npm run validate` fails when a committed file differs from what this produces.
//
//   .claude-plugin/plugin.json        Claude Code plugin
//   .claude-plugin/marketplace.json   Claude Code marketplace (this repo)
//   plugin.json                       Agent Plugins 1.0.0 (ChatGPT, Codex), with extensions.com.openai
//   .codex-plugin/plugin.json         Codex compatibility manifest, for clients older than Agent Plugins
//   .agents/plugins/marketplace.json  Codex repo marketplace
//   skills/<name>/SKILL.md            metadata.version and license follow package.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, readJson, skillDirs } from './lib.mjs';

const pkg = readJson('package.json');
const REPO = pkg.homepage.replace(/#.*$/, '');

/** Listing copy. OpenAI limits: displayName and shortDescription ≤ 30 chars, ≤ 3 default prompts of ≤ 128. */
export const LISTING = {
    plugin: 'swarm',
    marketplace: 'swarm-skill',
    displayName: 'Swarm',
    shortDescription: 'Lead a team of cheap AI agents',
    description:
        'Lead a team of cheap pi workers (OpenRouter models) on a big, splittable task: you plan, assign and judge, workers build in their own git worktrees, a shared SQLite database is the only channel, and only work that builds and passes tests gets merged.',
    longDescription:
        'Swarm turns your agent into the lead of a team of cheap pi coding agents running OpenRouter models. The lead splits a large task (a migration, many files, many tests) into subtasks that do not collide, starts each worker in its own git worktree, coordinates through a shared SQLite database, audits every command the workers ran, and merges only work that builds and passes the tests.\n\nFor developers with big, splittable work where one strong agent doing everything costs too much.\n\nLimitations: it runs only when asked by name; it needs an OpenRouter API key with a credit limit and starts no workers under $5 left; workers run shell commands on the local machine without a sandbox, so use a disposable machine or VM; it needs a local executor (Codex CLI, the desktop app, Claude Code or pi) and does not run in web chat.',
    category: { openai: 'Developer Tools', claude: 'development' },
    capabilities: ['Read', 'Write'],
    defaultPrompt: [
        'Use $swarm to split this migration across a team of pi workers.',
        'Use $swarm to fix every failing test in this repo with a small team.',
    ],
    brandColor: '#EA580C',
    icon: './assets/icon.png',
};

const author = typeof pkg.author === 'string' ? parseAuthor(pkg.author) : pkg.author;
function parseAuthor(s) {
    const m = /^([^<(]+?)\s*(?:<([^>]+)>)?\s*(?:\(([^)]+)\))?$/.exec(s);
    return Object.fromEntries(Object.entries({ name: m[1], email: m[2], url: m[3] }).filter(([, v]) => v));
}

const openaiInterface = {
    displayName: LISTING.displayName,
    shortDescription: LISTING.shortDescription,
    longDescription: LISTING.longDescription,
    developerName: author.name,
    category: LISTING.category.openai,
    capabilities: LISTING.capabilities,
    websiteURL: REPO,
    supportURL: `${REPO}/issues`,
    privacyPolicyURL: `${REPO}/blob/main/PRIVACY.md`,
    termsOfServiceURL: `${REPO}/blob/main/LICENSE`,
    defaultPrompt: LISTING.defaultPrompt,
    brandColor: LISTING.brandColor,
    composerIcon: LISTING.icon,
    logo: LISTING.icon,
};

/** Every manifest, keyed by its path from the repo root. */
export function manifests() {
    const identity = { name: LISTING.plugin, version: pkg.version, description: LISTING.description, author };
    const links = { homepage: REPO, repository: REPO, license: pkg.license, keywords: pkg.keywords.filter((k) => k !== 'pi-package') };
    return {
        '.claude-plugin/plugin.json': {
            $schema: 'https://json.schemastore.org/claude-code-plugin-manifest.json',
            ...identity,
            displayName: LISTING.displayName,
            ...links,
            icon: LISTING.icon,
        },
        '.claude-plugin/marketplace.json': {
            $schema: 'https://json.schemastore.org/claude-code-marketplace.json',
            name: LISTING.marketplace,
            description: 'Swarm: one lead agent, a team of cheap pi workers.',
            owner: author,
            plugins: [{ name: LISTING.plugin, source: './', description: LISTING.description, category: LISTING.category.claude, keywords: links.keywords }],
        },
        'plugin.json': {
            $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
            ...identity,
            ...links,
            extensions: { 'com.openai': { requires_local_executor: true, interface: openaiInterface } },
        },
        '.codex-plugin/plugin.json': {
            ...identity,
            ...links,
            skills: './skills/',
            requires_local_executor: true,
            interface: openaiInterface,
        },
        '.agents/plugins/marketplace.json': {
            name: LISTING.marketplace,
            interface: { displayName: LISTING.displayName },
            plugins: [{
                name: LISTING.plugin,
                source: { source: 'local', path: './' },
                policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
                category: LISTING.category.openai,
            }],
        },
    };
}

export const render = (json) => `${JSON.stringify(json, null, 2)}\n`;

/** SKILL.md with metadata.version and license set from package.json. */
export function syncedSkill(text) {
    return text
        .replace(/^(\s+version:\s*)"[^"]*"/m, `$1"${pkg.version}"`)
        .replace(/^license:.*$/m, `license: ${pkg.license}`);
}

/** Files whose committed content differs from the generated one. */
export function drift() {
    const out = [];
    for (const [path, json] of Object.entries(manifests())) {
        let have = '';
        try {
            have = readFileSync(join(ROOT, path), 'utf8');
        } catch {}
        if (have !== render(json)) out.push(path);
    }
    for (const dir of skillDirs()) {
        const path = join(dir, 'SKILL.md');
        const text = readFileSync(path, 'utf8');
        if (syncedSkill(text) !== text) out.push(path.slice(ROOT.length + 1));
    }
    return out;
}

if (import.meta.main) {
    for (const [path, json] of Object.entries(manifests())) {
        mkdirSync(dirname(join(ROOT, path)), { recursive: true });
        writeFileSync(join(ROOT, path), render(json));
    }
    for (const dir of skillDirs()) {
        const path = join(dir, 'SKILL.md');
        writeFileSync(path, syncedSkill(readFileSync(path, 'utf8')));
    }
    console.log(`✔ manifests and skills synced to ${pkg.name}@${pkg.version}`);
}
