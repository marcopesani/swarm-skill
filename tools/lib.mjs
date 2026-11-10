// Shared helpers for the repo tooling (validate, package). Not part of the skill itself.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseDocument } from 'yaml';

export const ROOT = resolve(import.meta.dirname, '..');
export const SKILLS_DIR = join(ROOT, 'skills');

/** The six fields of the Agent Skills spec (agentskills.io/specification). */
export const SPEC_FIELDS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);

/** Host extensions that some agents read and the spec does not define. Claude Code reads all of
 *  them; pi reads disable-model-invocation. claude.ai uploads and the Skills API reject them, so
 *  `npm run package` moves them into `metadata` for that build. */
export const HOST_FIELDS = new Set([
    'disable-model-invocation', 'user-invocable', 'argument-hint', 'arguments', 'when_to_use', 'disallowed-tools',
    'model', 'effort', 'context', 'agent', 'background', 'hooks', 'paths', 'shell',
]);

/** Every skill folder in skills/. */
export function skillDirs() {
    return readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(SKILLS_DIR, e.name, 'SKILL.md')))
        .map((e) => join(SKILLS_DIR, e.name));
}

/** Splits SKILL.md into its YAML document and body. Frontmatter must open on line 1. */
export function readSkill(dir) {
    const file = join(dir, 'SKILL.md');
    const text = readFileSync(file, 'utf8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
    if (!m) throw new Error(`${file}: frontmatter must start on line 1 between --- markers`);
    const doc = parseDocument(m[1]);
    if (doc.errors.length) throw new Error(`${file}: ${doc.errors.map((e) => e.message).join('; ')}`);
    return { file, text, doc, data: doc.toJS() ?? {}, body: m[2] };
}

/** SKILL.md with only spec fields: host extensions move into metadata as strings. */
export function strictSkillMd(dir) {
    const { doc, body } = readSkill(dir);
    const moved = [];
    for (const pair of [...doc.contents.items]) {
        const key = String(pair.key.value ?? pair.key);
        if (SPEC_FIELDS.has(key)) continue;
        const value = doc.get(key);
        doc.delete(key);
        if (!doc.has('metadata')) doc.set('metadata', doc.createNode({}));
        doc.setIn(['metadata', key], typeof value === 'string' ? value : JSON.stringify(value?.toJSON?.() ?? value));
        moved.push(key);
    }
    return { text: `---\n${doc.toString({ lineWidth: 0 })}---\n${body}`, moved };
}

export const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
export const exists = (path, base = ROOT) => existsSync(resolve(base, path));
export { dirname, join };
