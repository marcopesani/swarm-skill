#!/usr/bin/env node
// Keep-a-Changelog helper.
//
//   node tools/changelog.mjs release       turn "## [Unreleased]" into "## [<package.json version>] - <today>"
//                                          (runs from `npm version`, via the "version" script)
//   node tools/changelog.mjs notes [ver]   print the notes of one version (default: package.json's)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readJson } from './lib.mjs';

const FILE = join(ROOT, 'CHANGELOG.md');

/** The body under "## [version]" up to the next "## " heading, trimmed. */
export function section(text, version) {
    const esc = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`^## \\[${esc}\\][^\\n]*\\n([\\s\\S]*?)(?=^## |^\\[[^\\]]+\\]: |(?![\\s\\S]))`, 'm').exec(text);
    return m ? m[1].trim() : null;
}

export function release(text, version, date) {
    if (section(text, version) !== null) return text; // already released (e.g. re-running a tag)
    const unreleased = section(text, 'Unreleased');
    if (!unreleased) throw new Error('CHANGELOG.md: "## [Unreleased]" is missing or empty; describe the changes first');
    let out = text.replace(/^## \[Unreleased\][^\n]*\n/m, `## [Unreleased]\n\n## [${version}] - ${date}\n`);
    // Compare links: [Unreleased] now starts at this version; this version spans from the previous one.
    const link = /^\[Unreleased\]: (\S+)\/compare\/(v[^.\s]+\.[^.\s]+\.[^.\s]+)\.\.\.HEAD$/m.exec(out);
    if (link) {
        const [line, base, prev] = link;
        out = out.replace(line, `[Unreleased]: ${base}/compare/v${version}...HEAD\n[${version}]: ${base}/compare/${prev}...v${version}`);
    }
    return out;
}

if (import.meta.main) {
    const [cmd, arg] = process.argv.slice(2);
    const text = readFileSync(FILE, 'utf8');
    const version = arg ?? readJson('package.json').version;
    if (cmd === 'release') {
        writeFileSync(FILE, release(text, version, new Date().toISOString().slice(0, 10)));
        console.log(`✔ CHANGELOG.md: released ${version}`);
    } else if (cmd === 'notes') {
        const notes = section(text, version);
        if (notes === null) {
            console.error(`✘ CHANGELOG.md has no section for ${version}`);
            process.exit(1);
        }
        console.log(notes);
    } else {
        console.error('usage: changelog.mjs release | notes [version]');
        process.exit(1);
    }
}
