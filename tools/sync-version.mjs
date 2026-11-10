#!/usr/bin/env node
// Copies package.json's version into every manifest and SKILL.md metadata.version.
// Runs on its own from `npm version <patch|minor|major>` (the "version" lifecycle script).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readJson, skillDirs } from './lib.mjs';

const { version } = readJson('package.json');
for (const file of ['.claude-plugin/plugin.json', 'plugin.json']) {
    const path = join(ROOT, file);
    writeFileSync(path, readFileSync(path, 'utf8').replace(/("version":\s*")[^"]*(")/, `$1${version}$2`));
}
for (const dir of skillDirs()) {
    const path = join(dir, 'SKILL.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^(\s+version:\s*)"[^"]*"/m, `$1"${version}"`));
}
console.log(`✔ version ${version} in every manifest and skill`);
