#!/usr/bin/env node
// Validates the skill against the Agent Skills spec (with the reference validator, skills-ref) and
// every distribution manifest in this repo against its host's rules, and checks they agree.
//
//   node tools/validate.mjs        exit code = number of errors; warnings do not fail
import { readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { validateMetadata } from 'skills-ref';
import { parse as parseYaml } from 'yaml';
import { HOST_FIELDS, ROOT, SPEC_FIELDS, exists, readJson, readSkill, skillDirs } from './lib.mjs';

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const KEBAB = /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const pkg = readJson('package.json');
const version = pkg.version;

/* ── skills ─────────────────────────────────────────────────────────────────── */

const dirs = skillDirs();
if (!dirs.length) err('skills/', 'no skill folder with a SKILL.md');

for (const dir of dirs) {
    const where = relative(ROOT, join(dir, 'SKILL.md'));
    let skill;
    try {
        skill = readSkill(dir);
    } catch (e) {
        err(where, e.message);
        continue;
    }
    const { data, body } = skill;

    // Agent Skills spec, via the reference validator, on the spec fields only.
    const spec = Object.fromEntries(Object.entries(data).filter(([k]) => SPEC_FIELDS.has(k)));
    for (const e of validateMetadata(spec, dir)) err(where, e);

    // Fields outside the spec: known host extensions warn, anything else is a typo.
    for (const key of Object.keys(data).filter((k) => !SPEC_FIELDS.has(k))) {
        if (HOST_FIELDS.has(key)) warn(where, `'${key}' is a Claude Code/pi extension; npm run package moves it into metadata for claude.ai`);
        else err(where, `unknown frontmatter field '${key}'`);
    }

    // Spec: metadata is a map of strings; allowed-tools is one space-separated string.
    if (data.metadata !== undefined) {
        if (typeof data.metadata !== 'object' || Array.isArray(data.metadata)) err(where, 'metadata must be a map');
        else for (const [k, v] of Object.entries(data.metadata)) if (typeof v !== 'string') err(where, `metadata.${k} must be a string (quote it)`);
        if (data.metadata?.version && data.metadata.version !== version) err(where, `metadata.version ${data.metadata.version} != package.json ${version}`);
    }
    if (data['allowed-tools'] !== undefined && (typeof data['allowed-tools'] !== 'string' || data['allowed-tools'].includes(',')))
        err(where, 'allowed-tools must be a space-separated string');

    // Claude Code truncates description + when_to_use at 1,536 chars; Codex shortens long lists.
    if (`${data.description ?? ''}${data.when_to_use ?? ''}`.length > 1536) warn(where, 'description + when_to_use over 1,536 chars: Claude Code truncates it');

    // Progressive disclosure: keep SKILL.md under 500 lines.
    const lines = body.split('\n').length;
    if (lines > 500) warn(where, `body is ${lines} lines; the spec recommends under 500`);

    // Files the body names must ship with the skill.
    const refs = new Set([...body.matchAll(/(?:`|\]\(|<skill>\/)((?:references|scripts|assets|workers|agents)\/[\w./-]+?)(?=[`)\s])/g)].map((m) => m[1]));
    for (const ref of refs) if (!exists(ref, dir)) err(where, `references ${ref}, which does not exist`);

    // Codex metadata (agents/openai.yaml).
    const oai = join(dir, 'agents', 'openai.yaml');
    if (!exists(oai)) warn(where, 'no agents/openai.yaml (Codex UI metadata and invocation policy)');
    else {
        const y = parseYaml(readFileSync(oai, 'utf8')) ?? {};
        const yw = relative(ROOT, oai);
        for (const k of ['icon_small', 'icon_large']) if (y.interface?.[k] && !exists(y.interface[k], dir)) err(yw, `interface.${k} ${y.interface[k]} does not exist`);
        const implicit = y.policy?.allow_implicit_invocation;
        if (implicit !== undefined && typeof implicit !== 'boolean') err(yw, 'policy.allow_implicit_invocation must be a boolean');
        if (data['disable-model-invocation'] === true && implicit !== false)
            err(yw, 'SKILL.md sets disable-model-invocation, so set policy.allow_implicit_invocation: false for Codex too');
    }
}

/* ── manifests ──────────────────────────────────────────────────────────────── */

const names = new Set(dirs.map((d) => basename(d)));
const checkIcon = (where, path) => path && !exists(path) && err(where, `icon ${path} does not exist`);

// Claude Code plugin + marketplace.
const claude = readJson('.claude-plugin/plugin.json');
if (!KEBAB.test(claude.name)) err('.claude-plugin/plugin.json', `name '${claude.name}' must be kebab-case`);
if (/^(claude|anthropic|cc-plugin)-|^(claude|anthropic|anthropics|claude-code)$/.test(claude.name)) err('.claude-plugin/plugin.json', 'name is reserved by Anthropic');
if (claude.version !== version) err('.claude-plugin/plugin.json', `version ${claude.version} != package.json ${version}`);
checkIcon('.claude-plugin/plugin.json', claude.icon);

const cm = readJson('.claude-plugin/marketplace.json');
if (!cm.name || !cm.owner?.name || !Array.isArray(cm.plugins)) err('.claude-plugin/marketplace.json', 'needs name, owner.name and plugins');
for (const p of cm.plugins ?? []) {
    if (p.name !== claude.name) err('.claude-plugin/marketplace.json', `entry '${p.name}' must match plugin.json name '${claude.name}'`);
    if (typeof p.source === 'string' && (p.source.includes('..') || !p.source.startsWith('./') || !exists(p.source))) err('.claude-plugin/marketplace.json', `source ${p.source} must be ./-relative, inside the repo, and exist`);
}

// Agent Plugins manifest (OpenAI ChatGPT/Codex): plugin.json at the root, closed schema.
const ap = readJson('plugin.json');
const AP_KEYS = new Set(['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions']);
if (ap.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json') err('plugin.json', '$schema must be the Agent Plugins 1.0.0 schema');
for (const k of Object.keys(ap)) if (!AP_KEYS.has(k)) err('plugin.json', `'${k}' is not allowed by the Agent Plugins schema`);
if (!/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(ap.name ?? '') || ap.name.length > 64) err('plugin.json', `invalid name '${ap.name}'`);
if (ap.name !== claude.name) err('plugin.json', `name '${ap.name}' != .claude-plugin/plugin.json '${claude.name}'`);
if (ap.version !== version) err('plugin.json', `version ${ap.version} != package.json ${version}`);
const ui = ap.extensions?.['com.openai']?.interface ?? {};
for (const k of ['composerIcon', 'logo']) checkIcon('plugin.json', ui[k]);

// Codex repo marketplace.
const om = readJson('.agents/plugins/marketplace.json');
for (const p of om.plugins ?? []) {
    const w = '.agents/plugins/marketplace.json';
    if (p.name !== ap.name) err(w, `entry '${p.name}' must match plugin.json name '${ap.name}'`);
    if (!p.policy?.installation || !p.policy?.authentication || !p.category) err(w, `entry '${p.name}' needs policy.installation, policy.authentication and category`);
    const path = typeof p.source === 'string' ? p.source : p.source?.path;
    if (p.source?.source === 'local' || typeof p.source === 'string') if (!path?.startsWith('./') || path.includes('..') || !exists(path)) err(w, `source path ${path} must be ./-relative, inside the repo, and exist`);
}

// pi package.
if (!pkg.keywords?.includes('pi-package')) warn('package.json', "add the 'pi-package' keyword to be listed in the pi package gallery");
for (const s of pkg.pi?.skills ?? []) if (!exists(s)) err('package.json', `pi.skills entry ${s} does not exist`);

// The skill folder names stay the single source of truth for skill names.
for (const n of names) if (!KEBAB.test(n)) err(`skills/${n}`, 'folder name must be kebab-case');

/* ── report ─────────────────────────────────────────────────────────────────── */

for (const w of warnings) console.log(`⚠ ${w}`);
for (const e of errors) console.log(`✘ ${e}`);
console.log(errors.length ? `✘ ${errors.length} error(s)` : `✔ ${dirs.length} skill(s) and 4 manifests valid (version ${version})`);
process.exit(errors.length);
