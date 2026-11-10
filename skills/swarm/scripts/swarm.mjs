#!/usr/bin/env node
// swarm workbench: only the rules that guard money, credentials and safety, so they are
// tested and never drift. Everything else (installing tools, the workspace, worktrees,
// status, stopping workers) is written steps in SKILL.md, where a failure shows its reason.
//
//   swarm budget                         the OpenRouter key works (live), its limit, what is left
//   swarm skills [--root DIR]…           skills a worker could get (Claude Code, Codex, pi, npx skills
//                                        locations), each portable or not, with its folder
//   swarm spawn <id> [--skill DIR]… [--dir DIR] [--model M] [--thinking L] <task…>
//                                        one pi worker in <dir>/worktrees/<id>, which must exist
//   swarm audit [--dir DIR]              flag risky commands in every worker log (offline monitor)
//
// DIR defaults to ~/.swarm. Exit code: number of problems found (0 = clean).

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

export const KEY_URL = 'https://openrouter.ai/api/v1/key';
export const FLOOR = 5; // dollars: below this, no new workers start
export const MODEL = 'deepseek/deepseek-v4.1-flash-1017';
export const THINKING = 'high';
const SKILL_ROOT = resolve(import.meta.dirname, '..');
const USAGE = 'usage: swarm <budget|skills|spawn|audit> …  (see file header)';

/* ── OpenRouter key ─────────────────────────────────────────────────────────── */

const WHERE_KEY = 'Set OPENROUTER_API_KEY in the environment, or add the key as a secret of the cloud environment, then run budget again.';

/** Asks OpenRouter about the key in use. One live call covers both sources: a key in the
 *  environment, or a secret a proxy adds to the request (then the variable may be absent or a dummy). */
export async function checkKey({ env, fetch }) {
    const source = env.OPENROUTER_API_KEY ? 'env' : 'proxy';
    const headers = env.OPENROUTER_API_KEY ? { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } : {};
    let res;
    try {
        res = await fetch(KEY_URL, { headers });
    } catch (e) {
        return { ok: false, reason: `OpenRouter unreachable (${e.message}). Check the network, not the key.` };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, reason: `No valid OpenRouter key (HTTP ${res.status}). ${WHERE_KEY}` };
    if (!res.ok) return { ok: false, reason: `OpenRouter /key answered HTTP ${res.status}.` };
    const data = (await res.json().catch(() => null))?.data;
    if (data && data.limit === null) return { ok: false, reason: 'This key has no credit limit. Workers spend on their own, so set a limit on the key at openrouter.ai/settings/keys first.' };
    if (typeof data?.limit_remaining !== 'number') return { ok: false, reason: 'OpenRouter /key answered without limit_remaining; budget unknown, so no worker may start.' };
    return { ok: true, source, usage: data.usage, limit: data.limit, remaining: data.limit_remaining };
}

/** fetch through curl: Node's fetch ignores HTTPS_PROXY, so behind a proxy that adds the key it
 *  would reach OpenRouter without it. The key goes to curl on stdin, not on its command line. */
export async function curlFetch(url, { headers }) {
    const lines = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n');
    const r = spawnSync('curl', ['-sS', '--max-time', '20', '-H', '@-', '-w', '\n%{http_code}', url], { input: lines, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr.trim() || `curl exited ${r.status}`);
    const cut = r.stdout.lastIndexOf('\n');
    return new Response(r.stdout.slice(0, cut), { status: Number(r.stdout.slice(cut + 1)) });
}

const money = (n) => `$${Number(n).toFixed(2)}`;

/** Checks the key and the floor; prints one line; returns the key result plus a problem count. */
async function budgetGate(deps) {
    const key = await checkKey(deps);
    if (!key.ok) {
        console.log(`✘ ${key.reason}`);
        return { ...key, problems: 1 };
    }
    console.log(`${key.remaining < FLOOR ? '✘' : '✔'} OpenRouter key (${key.source === 'env' ? 'OPENROUTER_API_KEY' : 'added by proxy'}): ${money(key.usage)} used, ${money(key.remaining)} of ${money(key.limit)} left`);
    if (key.remaining < FLOOR) {
        console.log(`✘ Under the ${money(FLOOR)} floor: start no new workers and tell the user.`);
        return { ...key, problems: 1 };
    }
    return { ...key, problems: 0 };
}

/* ── skills a worker can get ────────────────────────────────────────────────── */

// A pi worker has file, shell and edit tools only: no MCP servers, no Claude Code tools, no web.
const CLAUDE_ONLY = /\b(AskUserQuestion|ToolSearch|TodoWrite|TaskCreate|TaskUpdate|SendMessage|EnterPlanMode|ExitPlanMode|NotebookEdit|WebFetch|WebSearch)\b|\b(Skill|Agent|Task|Artifact) tool\b/;

/** Why a skill would fail or mislead a pi worker; empty when it is portable. */
export function portabilityProblems(text) {
    const problems = [];
    if (/mcp__\w+|\bMCP\b/.test(text)) problems.push('uses MCP tools');
    if (/CLAUDE_(PLUGIN_ROOT|PLUGIN_DATA|SKILL_DIR)/.test(text)) problems.push('uses Claude Code path variables');
    const tool = CLAUDE_ONLY.exec(text);
    if (tool) problems.push(`needs a Claude Code tool (${tool[0]})`);
    // allowed-tools is a one-line list or a YAML block of "- Tool" lines.
    const allowed = (/^allowed-tools:(.*(?:\n[ \t]*-[ \t].*)*)/m.exec(text)?.[1] ?? '').replace(/\s*\n[ \t]*-[ \t]*/g, ', ').replace(/^,\s*/, '');
    if (/\b(Agent|Skill|Task)\b/.test(allowed)) problems.push(`allowed-tools lists a Claude Code tool (${allowed.trim()})`);
    return problems;
}

/** Project skill folders from cwd up to the repository root (how Codex and pi find `.agents/skills`). */
function projectDirs(cwd) {
    const dirs = [];
    for (let d = resolve(cwd); ; d = dirname(d)) {
        dirs.push(d);
        if (existsSync(join(d, '.git')) || dirname(d) === d) return dirs;
    }
}

/** Where the agents and installers people use put skills:
 *  Claude Code (~/.claude/skills, plugins), the Agent Skills standard used by Codex, pi, Cursor
 *  and `npx skills` (.agents/skills, ~/.agents/skills, ~/.config/agents/skills), pi's own folders,
 *  Codex plugins and its admin folder. Missing roots are skipped. */
export const defaultRoots = (cwd = process.cwd(), home = homedir()) => [
    join(home, '.claude', 'skills'),
    join(home, '.claude', 'plugins'),
    join(home, '.agents', 'skills'),
    join(home, '.config', 'agents', 'skills'),
    join(home, '.pi', 'agent', 'skills'),
    join(home, '.codex', 'skills'),
    join(home, '.codex', 'plugins'),
    '/etc/codex/skills',
    ...projectDirs(cwd).flatMap((d) => [join(d, '.claude', 'skills'), join(d, '.agents', 'skills'), join(d, '.pi', 'skills')]),
];

/** SKILL.md files under root. Follows symlinks (`npx skills` links agent folders to one copy)
 *  and visits each real folder once, so a loop or a second link cannot list a skill twice. */
function skillFiles(root, depth = 0, seen = new Set()) {
    if (depth > 8 || !existsSync(root)) return [];
    const real = realpathSync(root);
    if (seen.has(real)) return [];
    seen.add(real);
    const out = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const path = join(root, entry.name);
        let kind = entry;
        if (entry.isSymbolicLink()) {
            try {
                kind = statSync(path);
            } catch {
                continue; // broken link
            }
        }
        if (kind.isFile() && entry.name === 'SKILL.md') out.push(path);
        else if (kind.isDirectory()) out.push(...skillFiles(path, depth + 1, seen));
    }
    return out;
}

// Plugin manifests, in the order hosts prefer them: Claude Code, Agent Plugins (OpenAI), Codex overlay.
const MANIFESTS = [['.claude-plugin', 'plugin.json'], ['plugin.json'], ['.codex-plugin', 'plugin.json']];

function pluginName(skillDir) {
    if (basename(dirname(skillDir)) !== 'skills') return null;
    const root = dirname(dirname(skillDir));
    for (const parts of MANIFESTS) {
        const file = join(root, ...parts);
        if (!existsSync(file)) continue;
        try {
            const name = JSON.parse(readFileSync(file, 'utf8')).name;
            if (typeof name === 'string' && name) return name;
        } catch {
            // unreadable manifest: try the next one
        }
    }
    return null;
}

/** Every skill under the roots: qualified name (plugin:name inside a plugin), description, folder, portability.
 *  A skill reached through several roots or links is listed once. */
export function findSkills(roots) {
    const seen = new Set();
    const files = roots.flatMap((root) => skillFiles(root)).filter((file) => {
        const real = realpathSync(file);
        return seen.has(real) ? false : (seen.add(real), true);
    });
    return files.map((file) => {
        const text = readFileSync(file, 'utf8');
        const dir = dirname(file);
        const name = /^name:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(text)?.[1] ?? basename(dir);
        const plugin = pluginName(dir);
        const description = (/^description:\s*(?:>-?\s*)?([\s\S]*?)\n[\w-]+:/m.exec(text)?.[1] ?? '').replace(/\s+/g, ' ').trim();
        return { name, qualified: plugin ? `${plugin}:${name}` : name, description, dir, problems: portabilityProblems(text) };
    });
}

/* ── workers ────────────────────────────────────────────────────────────────── */

/** The pi command line for one worker: only the skills the lead chose, no MCP, no startup network
 *  calls (so a worker needs only openrouter.ai), team rules appended. */
export function piArgs({ model = MODEL, thinking = THINKING, skills = [], task, rules }) {
    const load = skills.length ? `Before anything else, read and follow these skills: ${skills.map((s) => `${s.name} (${join(s.dir, 'SKILL.md')})`).join(', ')}.\n\n` : '';
    return ['-p', '--no-session', '--provider', 'openrouter', '--model', model, '--thinking', thinking, '--mode', 'json', '--no-skills', '--no-mcp', '--offline', ...skills.flatMap((s) => ['--skill', s.dir]), '--append-system-prompt', rules, '--', load + task];
}

// A worker gets no credentials: only what a shell, git, pi and the proxy need. Anything else in
// the lead's environment (GitHub tokens, cloud keys) stays out of a worker's reach.
const PASS = /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LC_\w+|TERM|TMPDIR|TZ|(HTTPS?|NO|ALL)_PROXY|(https?|no|all)_proxy|NODE_EXTRA_CA_CERTS|SSL_CERT_(FILE|DIR)|CURL_CA_BUNDLE|REQUESTS_CA_BUNDLE|GIT_SSL_CAINFO)$/;

/** The environment one worker runs with. pi needs the key itself; behind a proxy that adds it, a dummy. */
export function workerEnv(env, id, db) {
    const kept = Object.fromEntries(Object.entries(env).filter(([k]) => PASS.test(k)));
    return { ...kept, AGENT_ID: id, SWARM_DB: db, GIT_TERMINAL_PROMPT: '0', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0', OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || 'sk-or-v1-proxy-injected' };
}

// What the offline monitor flags in a worker's log: attempts to gain privileges, read secrets,
// reach the network on its own, leave its worktree, push, or tamper with the team's controls.
export const RISKS = [
    ['privilege', /\b(sudo|su -|chmod [0-7]*[4-7][0-7]{3}|setuid|chown root|docker|podman)\b/],
    ['secrets', /\b(printenv|OPENROUTER_API_KEY|GITHUB_TOKEN|GH_TOKEN|id_rsa|id_ed25519)\b|\/proc\/\d+\/environ|\.aws\/credentials|\.netrc\b|\bauth\.json\b/],
    ['network', /\b(curl|wget|nc|ncat|ssh|scp)\b[^"|;&\n]*?(https?:\/\/|@|\d+\.\d+\.\d+\.\d+)/],
    ['push', /\bgit\s+(push|remote\s+(add|set-url))\b/],
    ['outside worktree', /\brm\s+-rf\s+[\/~]|\.claude\/|\.codex\/|\.pi\/agent|\/worktrees\/[\w-]+/],
    ['controls', /\b(DROP\s+TABLE|DELETE\s+FROM\s+(announce|assign|landed)\b|kill\s+-9|pkill|swarm\.mjs)/i],
];

/** Flags in one worker's log, with what each matched. Its own worktree path is not a flag:
 *  it shows up in nearly every tool result. */
export function auditLog(text, id) {
    const flags = [];
    for (const line of text.split('\n')) {
        for (const [kind, rule] of RISKS) {
            for (const m of line.matchAll(new RegExp(rule.source, `${rule.flags}g`))) {
                if (kind === 'outside worktree' && m[0] === `/worktrees/${id}`) continue;
                flags.push({ kind, match: m[0], excerpt: line.slice(Math.max(0, m.index - 60), m.index + 100) });
            }
        }
    }
    return flags;
}

const sql = (s) => `'${String(s).replaceAll("'", "''")}'`;
const alive = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};
const workspace = (dir) => ({ db: join(dir, 'swarm.db'), logs: join(dir, 'logs'), pids: join(dir, 'pids'), worktrees: join(dir, 'worktrees') });

function cmdSkills(roots) {
    for (const s of findSkills(roots)) console.log(`${s.problems.length ? '✘' : '✔'} ${s.qualified}  ${s.dir}${s.problems.length ? `  (${s.problems.join('; ')})` : ''}\n    ${s.description.slice(0, 160)}`);
    return 0;
}

async function cmdSpawn(id, opts, deps) {
    if (!/^[a-z0-9][a-z0-9-]{0,30}$/i.test(id ?? '')) return (console.log('✘ worker id must be letters, digits and dashes (it becomes a branch name)'), 1);
    if (!opts.task) return (console.log('✘ no task given'), 1);
    const ws = workspace(opts.dir);
    const pidFile = join(ws.pids, `${id}.pid`);
    if (existsSync(pidFile) && alive(Number(readFileSync(pidFile, 'utf8')))) return (console.log(`✘ worker ${id} is already running; pick another id`), 1);

    const skills = [];
    for (const dir of opts.skills) {
        if (!existsSync(join(dir, 'SKILL.md'))) return (console.log(`✘ no SKILL.md in ${dir}; pass a folder that swarm skills lists`), 1);
        const [skill] = findSkills([resolve(dir)]);
        if (skill.problems.length) return (console.log(`✘ skill ${skill.qualified} is not portable to a pi worker: ${skill.problems.join('; ')}`), 1);
        skills.push(skill);
    }

    const gate = await budgetGate(deps);
    if (gate.problems) return gate.problems;

    const tree = join(ws.worktrees, id);
    if (!existsSync(tree)) return (console.log(`✘ no worktree at ${tree}; create and prepare it first (SKILL.md, step 4)`), 1);

    for (const d of [ws.logs, ws.pids]) mkdirSync(d, { recursive: true });
    const log = openSync(join(ws.logs, `${id}.jsonl`), 'a');
    const env = workerEnv(deps.env, id, ws.db);
    const args = piArgs({ model: opts.model, thinking: opts.thinking, skills, task: opts.task, rules: join(SKILL_ROOT, 'workers', 'AGENTS.md') });
    const child = spawn('pi', args, { cwd: tree, env, detached: true, stdio: ['ignore', log, log] });
    child.unref();
    writeFileSync(pidFile, String(child.pid));
    const names = skills.map((s) => s.qualified).join(',');
    spawnSync('sqlite3', [ws.db, `INSERT INTO assign (agent_id, task, skills, worktree) VALUES (${sql(id)}, ${sql(opts.task)}, ${sql(names)}, ${sql(tree)});`]);
    console.log(`✔ ${id} started (pid ${child.pid}) in ${tree}${names ? ` with ${names}` : ''}; log ${join(ws.logs, `${id}.jsonl`)}`);
    return 0;
}

function cmdAudit(dir) {
    const ws = workspace(dir);
    let problems = 0;
    for (const file of existsSync(ws.logs) ? readdirSync(ws.logs).filter((f) => f.endsWith('.jsonl')) : []) {
        const id = file.slice(0, -6);
        const flags = auditLog(readFileSync(join(ws.logs, file), 'utf8'), id);
        problems += flags.length;
        console.log(`${flags.length ? '✘' : '✔'} ${id}: ${flags.length} flagged`);
        for (const f of flags) console.log(`    [${f.kind}] ${f.match}  …${f.excerpt.replace(/\s+/g, ' ')}…`);
    }
    return problems;
}

/* ── entry ──────────────────────────────────────────────────────────────────── */

const OPTIONS = {
    dir: { type: 'string' },
    root: { type: 'string', multiple: true },
    skill: { type: 'string', multiple: true },
    model: { type: 'string' },
    thinking: { type: 'string' },
};

/** Returns the problem count, so a test can drive a command; only a direct run exits. */
export async function main(argv, deps = { env: process.env, fetch: curlFetch }) {
    let parsed;
    try {
        parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
    } catch (e) {
        if (!e.code?.startsWith('ERR_PARSE_ARGS')) throw e;
        console.log(`✘ ${e.message}`);
        console.log(USAGE);
        return 1;
    }
    const [cmd, ...rest] = parsed.positionals;
    const v = parsed.values;
    const dir = resolve(v.dir ?? join(homedir(), '.swarm'));
    const roots = v.root?.map((r) => resolve(r)) ?? defaultRoots();
    switch (cmd) {
        case 'budget': return (await budgetGate(deps)).problems;
        case 'skills': return cmdSkills(roots);
        case 'spawn': return cmdSpawn(rest[0], { dir, skills: v.skill ?? [], model: v.model, thinking: v.thinking, task: rest.slice(1).join(' ') }, deps);
        case 'audit': return cmdAudit(dir);
        default:
            console.log(USAGE);
            return cmd ? 1 : 0;
    }
}

// Node sets import.meta.main from 22.18 and 24.2 on. Older Node leaves it undefined, and the
// workbench would then do nothing and exit 0, which reads as a clean run.
if (import.meta.main === undefined) {
    console.log(`✘ swarm needs Node.js 22.18+ or 24.2+; this is ${process.version}`);
    process.exit(1);
}
if (import.meta.main) process.exit(await main(process.argv.slice(2)));
