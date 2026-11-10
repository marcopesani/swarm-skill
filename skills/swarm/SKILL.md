---
name: swarm
description: "Lead a team of cheap pi workers (OpenRouter models) on a large task that splits into parts: you plan, assign and judge, workers do the bulk in their own git worktrees, and a shared SQLite database is the only channel between you. Installs what it needs, checks the OpenRouter key and budget before anything starts, keeps credentials away from workers, audits what they ran, hands each worker only the skills its task needs, and merges only work that builds and passes tests. Use for big, splittable work (many files, many tests, a migration) where one strong agent doing it all costs too much. Run it only when the user asks for a swarm by name: it starts paid workers that spend on their own."
compatibility: "Needs only an OpenRouter API key (in the environment, or as a secret the environment's proxy adds). The agent installs everything else it finds missing (Node.js, curl, git, sqlite3, the pi coding agent). Network hosts it uses are listed in SKILL.md."
license: MIT
disable-model-invocation: true
allowed-tools: Bash Read Write Edit Grep Glob
metadata:
  version: "1.0.0"
  repository: "https://github.com/marcopesani/swarm-skill"
---

# Swarm

You are the **lead**. You plan, assign and judge; cheap pi workers do the bulk
of the work. You never hand off judgment: what gets merged is your call.

`<skill>` below is the absolute path of the folder holding this file. Write it
out in full: the commands run from the target repo, not from here. `$SW` is the
swarm's workspace (`~/.swarm` unless you choose another; pass it to the script
as `--dir`): it holds the database, logs, pid files and worker worktrees.
Start each command with `SW=~/.swarm;` (or your choice): a new shell does not
keep the variable.

Most steps are plain commands, so a failure shows its reason and you can adapt.
`scripts/swarm.mjs` holds only the rules that guard money, credentials and
safety (the key and budget check, which skills a worker may get, the worker's
environment and launch, the audit), because those are tested and must not
drift. Use it for those; never hand-run what it covers.

## 0. Where to run, and what it needs

Workers run shell commands on this machine with no sandbox around them. Their
environment is stripped of credentials and you audit what they ran (step 5),
but that is not isolation. Run a swarm in a disposable machine: a cloud session
or a VM, not a laptop with your SSH keys and cloud logins. If you are on a
personal machine, say so to the user and ask before you go on.

The user brings one thing: an **OpenRouter API key** with a credit limit. You
install everything else.

**Node.js** first, since the script runs on it: `node --version` must be 22.18+
or 24.2+. If it is missing or older, install Node 24 LTS with the system's
package manager (`brew install node@24` on macOS; on Debian or Ubuntu the
NodeSource repository, because the distro package is older), then check again.
Ask the user before any command that needs a password.

Hosts the setup and the run reach, for an environment with a network allowlist:

| Host | For |
|---|---|
| `openrouter.ai` | the key check and every worker's model calls |
| `registry.npmjs.org` | installing pi |
| the OS package mirrors (e.g. `archive.ubuntu.com`, `security.ubuntu.com`; `formulae.brew.sh` and `ghcr.io` for Homebrew) | installing curl, git, sqlite3 |
| `deb.nodesource.com` or `nodejs.org` | installing Node.js, only when it is missing |

Workers start with pi's startup network calls turned off, so while they work
they need `openrouter.ai` only, plus whatever the target repo's tests fetch.
The repo's own setup adds hosts: its git host (private submodules), its package
registry, whatever its tests download (a test database binary, browsers) and,
if it runs containers, their registries. Read them off the repo's setup docs or
CI config before you start; `references/worktree-setup.md` has a worked example.

## 1. Setup: check before anything costs money

Install what is missing, with the system's package manager (`brew`, `apt-get`,
`dnf` or `apk`; with `sudo` only when you are not root, and ask the user first
when it needs a password):

```bash
for t in curl git sqlite3 pi; do command -v $t >/dev/null && echo "ok $t" || echo "MISSING $t"; done
```

- curl, git, sqlite3: the package of that name (`sqlite` on brew, dnf and apk).
- pi: `npm i -g @earendil-works/pi-coding-agent`, then `pi --version`.

Then the key and the budget, in one live call to OpenRouter:

```bash
node <skill>/scripts/swarm.mjs budget
```

That call proves the key works wherever it comes from: the `OPENROUTER_API_KEY`
variable, or a secret the cloud environment's proxy adds (where the variable
may be absent or a dummy). It prints the spend and what is left. It fails when:

- the key is missing or wrong (401/403): tell the user to set
  `OPENROUTER_API_KEY` or add the key as an environment secret. Stop.
- OpenRouter cannot be reached: that is the network or an allowlist (step 0),
  not the key. Say so.
- the key has no credit limit: workers spend on their own, so a key without a
  limit has no ceiling. Ask the user to set one. Stop.
- less than $5 is left: start no workers and tell the user.

Never print or echo the key yourself.

Then the workspace, and what the machine can hold (every worker's builds and
tests share it):

```bash
mkdir -p $SW/logs $SW/pids $SW/worktrees
nproc 2>/dev/null || sysctl -n hw.ncpu; free -g 2>/dev/null || vm_stat | head -2
sqlite3 $SW/swarm.db .tables
```

Then the database. If `.tables` prints nothing and an earlier session saved a dump,
import it first (`references/persistence.md`), because creating tables first would
clash with the dump. Then apply the schema; it only adds what is missing:

```bash
sqlite3 $SW/swarm.db < <skill>/assets/schema.sql
```

`assets/schema.sql` explains each table. Workers may add their own.

## 2. Plan

Read enough of the repo to split the goal into tasks a worker can finish and
test alone. Write them into `subtasks` (title, detail with the files and the
done check), post the plan in `notes`, and team-wide orders in `announce`. A
task too vague for you to check when it lands is too vague for a worker to do.

Shape the tasks so workers do not collide: one task, one set of files that
builds and tests on its own. Two workers editing the same file is the most
common way a parallel team loses work.

A big task becomes a **tree**: split it into children with `parent_id`, and let
a parent assume its children are done (a stub, an interface, a failing test the
child will make pass). Then many workers can build the parts at once instead of
waiting on each other. Workers may split further when a piece is too big.

## 3. Triage before you commit the team

Order the first workers to judge each top-level task's difficulty and post a
verdict in `notes` before they build. Put the team on what is doable first, and
set the rest aside, not away: once the doable part lands, there is no reason to
idle, so move workers onto what you set aside. Expect the early verdicts to be
too pessimistic; measured throughput beats a worker's guess.

## 4. Pick skills, then start small

```bash
node <skill>/scripts/swarm.mjs skills
```

It lists the skills on this machine, each marked ✔ portable or ✘ with the reason.
Give a task the skills that fit it, usually none to two. Read
`references/skills.md` before the first pick: it says which skills help a worker
and which ones break the team (anything that commits, pushes or orchestrates).

Each worker works in its own git worktree on a branch named after its id.
Create it from the target repo:

```bash
git -C <repo> worktree add -b w1 $SW/worktrees/w1      # existing branch: drop -b
```

A new worktree holds only tracked files: no submodules, no dependencies, no
caches. Set it up now, in your own shell, so the worker never needs install
credentials or network. Workers also inherit your `PATH`: put the repo's Node
version first (its `.nvmrc`) before you spawn, or their builds and tests run on
the wrong one.

Set up your own checkout first, then reuse its caches so each worktree installs
from disk, not the network. Run the repo's own install with its lockfile:

```bash
cd $SW/worktrees/w1 && git submodule update --init --depth 50   # if it has submodules
pnpm install --frozen-lockfile --prefer-offline    # pnpm hard-links from its store: seconds
npm ci --prefer-offline                            # npm
uv sync --frozen                                   # Python with uv
cargo fetch --locked                               # Rust (target/ is per worktree)
```

Then run one quick test in the worktree yourself. If it downloads something
(a test database binary, a browser), copy or hard-link that cache from your
checkout into the worktree, or every worker downloads it again.
`references/worktree-setup.md` walks through a full example: a pnpm monorepo
with private submodules and an in-memory MongoDB, at 6 s per worker.

Then start the worker, with the skill folders `swarm skills` printed:

```bash
node <skill>/scripts/swarm.mjs spawn w1 --dir $SW --skill <folder of test-driven-development> \
  "Judge the difficulty of subtasks #1-#4 and post a verdict for each in notes, then claim one you judged doable."
```

The worker gets the team rules (`workers/AGENTS.md`), only the skills you
named, no MCP, and an environment with no credentials (the lead's tokens and
cloud keys stay out). Spawn checks the budget again, and refuses an id already
running, a missing worktree, or a skill that is not portable. The default model is `deepseek/deepseek-v4.1-flash-1017` with
high reasoning; change it with `--model` / `--thinking` only when a task needs it.

Start 2 or 3 workers. Check their first landed work before you start more: a bad
plan multiplies with every worker you add. Scale to what the machine holds
(the cores and memory from step 1). When the team grows past a handful, form **crews**: a group of workers on
one area, with one of them as captain who posts the crew's plan in `notes` and
splits its work into subtasks. Name the crews and captains in `assign`.

## 5. Run the team

At each check-in:

```bash
node <skill>/scripts/swarm.mjs audit --dir $SW
node <skill>/scripts/swarm.mjs budget
for f in $SW/pids/*.pid; do id=$(basename $f .pid); kill -0 $(cat $f) 2>/dev/null && echo "running $id" || echo "ended   $id"; done
sqlite3 $SW/swarm.db "SELECT status, count(*) FROM subtasks GROUP BY status"
```

- **Audit first.** `audit` scans every worker's log for attempts to gain
  privileges, read secrets, reach the network on their own, push, leave their
  worktree, or tamper with the team's tables or this script. Read each flag in
  context (the log is in `$SW/logs/<id>.jsonl`). A flag that is an attempt to
  get around a boundary, not a false match: stop all workers, tell the user what you
  saw, and do not restart until they have looked. A flag on one worker that is
  a mistake, not an attempt: stop that worker and do its task another way.
- Read `notes` and `landed`. Answer questions tagged @lead.
- Post the budget left and the next open work in `announce`, so the team keeps
  going. Tell free workers not to wait for you: they take any open task.
- Move workers off finished or stuck work onto open tasks.
- Workers tend to give up or overrate difficulty. Before you drop a task marked
  blocked, push back once with evidence (the file, the command, what to try).
  The same holds for you: do not stop the run because a task looks hard.
- A worker that ended with work left can be started again with the same id: its
  worktree and branch are kept, so skip the worktree step.
- Under $5 left: start nothing new and tell the user.

To stop a worker, end its whole process group (pi and the commands it started);
its worktree and branch stay:

```bash
kill -TERM -- -$(cat $SW/pids/w3.pid)                    # one worker
for f in $SW/pids/*.pid; do kill -TERM -- -$(cat $f) 2>/dev/null; done   # all
```

## 6. Merge

For each `landed` row: check out the branch, read the diff, run the build and the
tests yourself. Merge only work that builds and passes; a worker's own "tests
pass" is a claim, not proof. Read the diff for changes outside the task too
(a test weakened, a check removed, a file the task did not name). Send rejected
work back with the reason as a new subtask. Only you merge and push.

## Lead-only work: specs, the live app, the final review

Some work stays in your session, never in a worker: anything that needs Docker
or root, owns a resource there is one of per machine (a dev stack on fixed
ports), or needs subagents, which pi does not have. `swarm skills` refuses such
skills for workers.

- **A spec is the plan.** When the repo has a spec or acceptance criteria for
  the work, or the work is big enough to write one first, make each criterion a
  top-level subtask with its id in the title. The final review then checks the
  same list.
- **Unit and integration tests run in the workers**, as long as each run is
  isolated: random ports, temp directories, in-memory or per-run databases.
  Check that two worktrees can run the same test file at once before you scale.
- **The live app is one per machine.** A dev stack with fixed ports, fixed
  container names or shared seed data cannot run once per worker, so workers
  never start it. A worker whose task needs the running app marks the subtask
  `needs-live` and says what to check. You run those checks one at a time,
  after merging, on your own checkout. Restart the app there, reset its data
  between checks, and log each result in `landed`.
- **Review once, at the end, on the merged branch.** A review or attestation
  tied to a commit goes stale at the next merge, so run your review skill (or
  your own full review) after the last merge. Turn its findings into subtasks,
  let workers fix them, merge, and review the new head. Review notes stay
  uncommitted in your checkout, and workers never touch them.

## 7. Keep the state

The container may be temporary. After each merge, at milestones, and always
before you end: commit and push the merged work, and export the database
(`references/persistence.md`). A run can then restart from its last save.
