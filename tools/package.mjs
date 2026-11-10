#!/usr/bin/env node
// Builds the release assets in dist/:
//
//   swarm-skill.zip   the skill alone: swarm/SKILL.md at the top. Frontmatter limited to the six
//                     Agent Skills fields (host extensions move into metadata), as claude.ai,
//                     Cowork and the Claude Skills API require. Unzipped, it drops into any agent's
//                     skills folder; `npx skills add <url>` takes it too.
//   swarm-plugin.zip  the plugin: plugin.json (Agent Plugins, OpenAI), .claude-plugin/plugin.json
//                     (Claude Code) and .codex-plugin/plugin.json at the top, skills/ beside them.
//                     For the OpenAI plugin portal, Codex desktop manual installs, and
//                     `claude --plugin-dir <zip>` / `--plugin-url <url>`.
//   SHA256SUMS        checksums of both zips
//
// The zips are deterministic (sorted entries, fixed timestamps), so a tag rebuilds the same bytes.
// The staged folders stay in dist/ so CI can run host validators on them.
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { validate } from 'skills-ref';
import { ROOT, skillDirs, strictSkillMd } from './lib.mjs';
import { zip } from './zip.mjs';

const DIST = join(ROOT, 'dist');
const SKIP = /(^|\/)(\.DS_Store|node_modules|\.git)$/;
const PLUGIN_FILES = ['plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'assets', 'skills', 'README.md', 'LICENSE', 'PRIVACY.md', 'CHANGELOG.md'];

function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir).sort()) {
        const path = join(dir, name);
        if (SKIP.test(path)) continue;
        if (statSync(path).isDirectory()) out.push(...walk(path));
        else out.push(path);
    }
    return out;
}

/** Zip entries for everything under base, with paths relative to base and prefixed. Executables keep +x. */
function entries(base, prefix = '') {
    return walk(base).map((file) => ({
        path: prefix + relative(base, file).split('\\').join('/'),
        data: readFileSync(file),
        mode: statSync(file).mode & 0o111 ? 0o755 : 0o644,
    }));
}

function write(name, buffer) {
    writeFileSync(join(DIST, name), buffer);
    return `${createHash('sha256').update(buffer).digest('hex')}  ${name}`;
}

export async function build() {
    rmSync(DIST, { recursive: true, force: true });
    mkdirSync(DIST, { recursive: true });
    const sums = [];
    const problems = [];

    // The skill alone, strict spec.
    const skills = skillDirs();
    if (skills.length !== 1) problems.push(`expected one skill in skills/, found ${skills.length}`);
    for (const dir of skills) {
        const name = basename(dir);
        const stage = join(DIST, `${name}-skill`, name);
        cpSync(dir, stage, { recursive: true, filter: (src) => !SKIP.test(src) });
        const { text, moved } = strictSkillMd(dir);
        writeFileSync(join(stage, 'SKILL.md'), text);
        for (const e of await validate(stage)) problems.push(`${name}-skill.zip: ${e}`);
        sums.push(write(`${name}-skill.zip`, zip(entries(join(DIST, `${name}-skill`)))));
        console.log(`✔ dist/${name}-skill.zip${moved.length ? ` (moved into metadata: ${moved.join(', ')})` : ''}`);
    }

    // The plugin, for both vendors.
    const plugin = JSON.parse(readFileSync(join(ROOT, 'plugin.json'), 'utf8')).name;
    const stage = join(DIST, `${plugin}-plugin`);
    for (const f of PLUGIN_FILES) cpSync(join(ROOT, f), join(stage, f), { recursive: true, filter: (src) => !SKIP.test(src) });
    sums.push(write(`${plugin}-plugin.zip`, zip(entries(stage))));
    console.log(`✔ dist/${plugin}-plugin.zip`);

    writeFileSync(join(DIST, 'SHA256SUMS'), `${sums.join('\n')}\n`);
    console.log('✔ dist/SHA256SUMS');
    return problems;
}

if (import.meta.main) {
    const problems = await build();
    for (const p of problems) console.log(`✘ ${p}`);
    process.exit(problems.length);
}
