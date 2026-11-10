// The repo tooling: release zips, manifests, changelog.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, mock } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { release, section } from '../tools/changelog.mjs';
import { ROOT, strictSkillMd } from '../tools/lib.mjs';
import { LISTING, drift, manifests } from '../tools/manifests.mjs';
import { build } from '../tools/package.mjs';
import { zip } from '../tools/zip.mjs';

/** Reads a zip's central directory: { path: { data, mode } }. */
function unzip(buf) {
    const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = buf.readUInt16LE(end + 10);
    let p = buf.readUInt32LE(end + 16);
    const files = {};
    for (let i = 0; i < count; i++) {
        const method = buf.readUInt16LE(p + 10);
        const size = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extra = buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
        const mode = (buf.readUInt32LE(p + 38) >>> 16) & 0o777;
        const local = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const body = buf.subarray(start, start + size);
        files[name] = { data: method === 8 ? inflateRawSync(body) : body, mode };
        p += 46 + nameLen + extra;
    }
    return files;
}

describe('zip', () => {
    it('round-trips and is deterministic', () => {
        const entries = [{ path: 'b/x.txt', data: Buffer.from('hello '.repeat(50)) }, { path: 'a.sh', data: Buffer.from('#!/bin/sh\n'), mode: 0o755 }];
        const a = zip(entries);
        assert.deepEqual(a, zip([...entries].reverse()));
        const files = unzip(a);
        assert.deepEqual(Object.keys(files), ['a.sh', 'b/x.txt']);
        assert.equal(files['b/x.txt'].data.toString(), 'hello '.repeat(50));
        assert.equal(files['a.sh'].mode, 0o755);
    });
});

describe('release assets', async () => {
    const log = mock.method(console, 'log', () => {});
    const problems = await build();
    log.mock.restore();
    const skill = unzip(readFileSync(join(ROOT, 'dist', 'swarm-skill.zip')));
    const plugin = unzip(readFileSync(join(ROOT, 'dist', 'swarm-plugin.zip')));

    it('builds without problems', () => assert.deepEqual(problems, []));

    it('skill zip: one swarm/ folder, strict frontmatter, executable script', () => {
        assert.ok(Object.keys(skill).every((p) => p.startsWith('swarm/')));
        const md = skill['swarm/SKILL.md'].data.toString();
        const front = md.split('\n---\n')[0];
        assert.doesNotMatch(front, /^disable-model-invocation:/m);
        assert.match(front, /^ {2}disable-model-invocation: "true"$/m);
        for (const f of ['scripts/swarm.mjs', 'workers/AGENTS.md', 'assets/schema.sql', 'references/skills.md', 'agents/openai.yaml'])
            assert.ok(skill[`swarm/${f}`], f);
        assert.equal(skill['swarm/scripts/swarm.mjs'].mode, 0o755);
    });

    it('plugin zip: both vendors\' manifests at the top, skill unchanged, no repo tooling', () => {
        for (const f of ['plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'LICENSE', 'assets/icon.png', 'skills/swarm/SKILL.md'])
            assert.ok(plugin[f], f);
        assert.equal(plugin['skills/swarm/SKILL.md'].data.toString(), readFileSync(join(ROOT, 'skills', 'swarm', 'SKILL.md'), 'utf8'));
        assert.ok(!Object.keys(plugin).some((p) => /^(tests|tools|node_modules|\.github|dist)\//.test(p) || p.endsWith('marketplace.json')));
    });

    it('passes unzip -t', { skip: spawnSync('unzip', ['-v']).status !== 0 && 'unzip not installed' }, () => {
        for (const z of ['swarm-skill.zip', 'swarm-plugin.zip']) assert.equal(spawnSync('unzip', ['-tq', join(ROOT, 'dist', z)]).status, 0, z);
    });

    it('lists checksums for both zips', () => {
        const sums = readFileSync(join(ROOT, 'dist', 'SHA256SUMS'), 'utf8');
        assert.match(sums, /^[0-9a-f]{64} {2}swarm-skill\.zip$/m);
        assert.match(sums, /^[0-9a-f]{64} {2}swarm-plugin\.zip$/m);
    });
});

describe('manifests', () => {
    it('committed files match the generator', () => assert.deepEqual(drift(), []));

    it('every manifest names the same plugin and version', () => {
        const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
        const m = manifests();
        for (const f of ['.claude-plugin/plugin.json', 'plugin.json', '.codex-plugin/plugin.json']) {
            assert.equal(m[f].name, LISTING.plugin);
            assert.equal(m[f].version, version);
        }
        assert.equal(m['.claude-plugin/marketplace.json'].plugins[0].name, LISTING.plugin);
        assert.equal(m['.agents/plugins/marketplace.json'].plugins[0].name, LISTING.plugin);
    });

    it('strict SKILL.md keeps every spec field', () => {
        const { text, moved } = strictSkillMd(join(ROOT, 'skills', 'swarm'));
        assert.deepEqual(moved, ['disable-model-invocation']);
        for (const f of ['name', 'description', 'compatibility', 'license', 'allowed-tools', 'metadata']) assert.match(text, new RegExp(`^${f}:`, 'm'));
    });
});

describe('changelog', () => {
    const text = '# Changelog\n\n## [Unreleased]\n\n- New thing\n\n## [1.0.0] - 2026-01-01\n\n- First\n\n[Unreleased]: https://x/compare/v1.0.0...HEAD\n[1.0.0]: https://x/releases/tag/v1.0.0\n';

    it('releases the Unreleased section and updates compare links', () => {
        const out = release(text, '1.1.0', '2026-02-02');
        assert.equal(section(out, '1.1.0'), '- New thing');
        assert.equal(section(out, 'Unreleased'), '');
        assert.equal(section(out, '1.0.0'), '- First');
        assert.match(out, /^\[Unreleased\]: https:\/\/x\/compare\/v1\.1\.0\.\.\.HEAD$/m);
        assert.match(out, /^\[1\.1\.0\]: https:\/\/x\/compare\/v1\.0\.0\.\.\.v1\.1\.0$/m);
    });

    it('refuses an empty release and leaves a released version alone', () => {
        const empty = text.replace('- New thing\n\n', '');
        assert.throws(() => release(empty, '1.1.0', '2026-02-02'), /missing or empty/);
        assert.equal(release(empty, '1.0.0', '2026-02-02'), empty);
    });

    it('has notes for the current version', () => {
        const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
        assert.ok(section(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'), version));
    });
});
