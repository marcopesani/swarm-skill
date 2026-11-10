#!/usr/bin/env node
// Builds dist/<skill>.zip for every skill: the upload format of claude.ai (Settings → Capabilities →
// Skills), the Claude Skills API and Cowork. Those reject frontmatter outside the Agent Skills spec,
// so host extensions (disable-model-invocation …) move into metadata; the source stays untouched.
// The zip then passes the reference validator (skills-ref), checked here before it is written.
//
//   node tools/package.mjs         writes dist/<name>.zip and dist/<name>/ (the staged folder)
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { validate } from 'skills-ref';
import { ROOT, skillDirs, strictSkillMd } from './lib.mjs';

const dist = join(ROOT, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

let problems = 0;
for (const dir of skillDirs()) {
    const name = basename(dir);
    const stage = join(dist, name);
    cpSync(dir, stage, { recursive: true, dereference: true, filter: (src) => !/(^|\/)(\.DS_Store|node_modules|\.git)$/.test(src) });
    const { text, moved } = strictSkillMd(dir);
    writeFileSync(join(stage, 'SKILL.md'), text);

    const errors = await validate(stage);
    if (errors.length) {
        problems += errors.length;
        for (const e of errors) console.log(`✘ ${name}: ${e}`);
        continue;
    }
    const zip = spawnSync('zip', ['-qrX', `${name}.zip`, name], { cwd: dist, encoding: 'utf8' });
    if (zip.status !== 0) {
        problems++;
        console.log(`✘ ${name}: zip failed: ${zip.stderr || zip.error?.message}`);
        continue;
    }
    console.log(`✔ dist/${name}.zip${moved.length ? ` (moved into metadata: ${moved.join(', ')})` : ''}`);
}
process.exit(problems);
