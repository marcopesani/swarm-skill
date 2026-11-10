// End to end: `swarm spawn` with a stub pi on PATH. Checks the worker's cwd, arguments and
// environment, the pid file, the log, the assign row, and the refusal of a second start.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it, mock } from 'node:test';
import { main } from '../skills/swarm/scripts/swarm.mjs';

const SKILL = resolve(import.meta.dirname, '..', 'skills', 'swarm');
const hasSqlite = spawnSync('sqlite3', ['-version']).status === 0;
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-spawn-')));
const sw = join(tmp, 'sw');
const bin = join(tmp, 'bin');
const out = join(tmp, 'out');
const pids = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(file, ms = 5000) {
    for (let t = 0; t < ms; t += 50) {
        if (existsSync(file) && readFileSync(file, 'utf8').includes('--END--')) return readFileSync(file, 'utf8');
        await sleep(50);
    }
    throw new Error(`stub pi never wrote ${file}`);
}

const deps = {
    env: {
        PATH: `${bin}:${process.env.PATH}`,
        HOME: tmp,
        LANG: 'C',
        GITHUB_TOKEN: 'ghp_must_not_leak',
        AWS_SECRET_ACCESS_KEY: 'aws_must_not_leak',
        OPENROUTER_API_KEY: 'sk-or-test',
    },
    fetch: async () => new Response(JSON.stringify({ data: { usage: 1, limit: 50, limit_remaining: 49 } }), { status: 200 }),
};

describe('spawn (stub pi)', { skip: !hasSqlite && 'sqlite3 not installed' }, () => {
    let log;
    before(() => {
        for (const d of [bin, out, join(sw, 'worktrees', 'w1'), join(sw, 'worktrees', 'w2')]) mkdirSync(d, { recursive: true });
        assert.equal(spawnSync('sqlite3', [join(sw, 'swarm.db')], { input: readFileSync(join(SKILL, 'assets', 'schema.sql')) }).status, 0);
        // The stub records what it got, then w2 stays alive so a second start can be refused.
        writeFileSync(join(bin, 'pi'), `#!/bin/sh
{ echo "CWD=$(pwd)"; printf 'ARG=%s\\n' "$@"; env | sed 's/^/ENV=/'; echo --END--; } > "${out}/$AGENT_ID.txt"
echo '{"type":"agent_end"}'
[ "$AGENT_ID" = w2 ] && sleep 30
exit 0
`);
        chmodSync(join(bin, 'pi'), 0o755);
        log = mock.method(console, 'log', () => {});
    });
    after(() => {
        log.mock.restore();
        for (const pid of pids) try { process.kill(-pid, 'SIGTERM'); } catch {}
        rmSync(tmp, { recursive: true, force: true });
    });

    it('starts pi in the worktree with the rules, the chosen skill, and no credentials', async () => {
        const tdd = join(tmp, 'skills', 'tdd');
        mkdirSync(tdd, { recursive: true });
        writeFileSync(join(tdd, 'SKILL.md'), '---\nname: tdd\ndescription: Test first.\n---\nWrite the test first.\n');

        assert.equal(await main(['spawn', 'w1', '--dir', sw, '--skill', tdd, 'Fix', 'subtask', '#1'], deps), 0);
        const pid = Number(readFileSync(join(sw, 'pids', 'w1.pid'), 'utf8'));
        pids.push(pid);
        const got = await waitFor(join(out, 'w1.txt'));

        assert.match(got, new RegExp(`^CWD=${join(sw, 'worktrees', 'w1')}$`, 'm'));
        for (const a of ['--no-skills', '--no-mcp', '--offline', '--mode', 'json', `--skill\nARG=${tdd}`]) assert.ok(got.includes(`ARG=${a}`), a);
        assert.ok(got.includes(`ARG=${join(SKILL, 'workers', 'AGENTS.md')}`), 'team rules appended');
        assert.match(got, /ARG=Before anything else, read and follow these skills: tdd/);
        assert.match(got, /Fix subtask #1/);

        assert.match(got, /^ENV=AGENT_ID=w1$/m);
        assert.match(got, new RegExp(`^ENV=SWARM_DB=${join(sw, 'swarm.db')}$`, 'm'));
        assert.match(got, /^ENV=OPENROUTER_API_KEY=sk-or-test$/m);
        assert.doesNotMatch(got, /must_not_leak/);
    });

    it('logs the worker and records the assignment', async () => {
        for (let t = 0; t < 40 && !readFileSync(join(sw, 'logs', 'w1.jsonl'), 'utf8'); t++) await sleep(50);
        assert.match(readFileSync(join(sw, 'logs', 'w1.jsonl'), 'utf8'), /agent_end/);
        const row = spawnSync('sqlite3', [join(sw, 'swarm.db'), "SELECT agent_id, task, skills, worktree FROM assign WHERE agent_id='w1'"], { encoding: 'utf8' }).stdout.trim();
        assert.equal(row, `w1|Fix subtask #1|tdd|${join(sw, 'worktrees', 'w1')}`);
    });

    it('refuses to start an id that is still running', async () => {
        assert.equal(await main(['spawn', 'w2', '--dir', sw, 'long task'], deps), 0);
        pids.push(Number(readFileSync(join(sw, 'pids', 'w2.pid'), 'utf8')));
        await waitFor(join(out, 'w2.txt'));
        assert.equal(await main(['spawn', 'w2', '--dir', sw, 'again'], deps), 1);
        assert.match(log.mock.calls.at(-1).arguments[0], /already running/);
    });

    it('refuses to start under the budget floor', async () => {
        const poor = { ...deps, fetch: async () => new Response(JSON.stringify({ data: { usage: 48, limit: 50, limit_remaining: 2 } })) };
        assert.equal(await main(['spawn', 'w3', '--dir', sw, 'task'], poor), 1);
        assert.ok(!existsSync(join(sw, 'pids', 'w3.pid')));
    });
});
