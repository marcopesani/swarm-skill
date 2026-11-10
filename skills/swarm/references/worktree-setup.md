# Preparing worktrees: a worked example

A new git worktree holds only tracked files: no submodules, no dependencies,
no caches. The lead prepares each one before spawning, in its own shell, so
workers never need install credentials or network. The goal is a worktree
where the repo's tests run offline, set up in seconds.

## Example: a pnpm monorepo with private submodules and an in-memory MongoDB

This is a real Node backend (measured: 6 s per worker, no downloads). Its
tests start `mongodb-memory-server`, which downloads a ~220 MB `mongod` binary
twice: once at install (postinstall) and once on the first test run.

Set up your own checkout first, with the repo's normal setup. Then, per worker:

```bash
cd $SW/worktrees/w1 \
  && git submodule update --init --depth 50 \
  && MONGOMS_DISABLE_POSTINSTALL=1 npx --yes "$(node -p 'require("./package.json").packageManager')" \
       install --frozen-lockfile --prefer-offline \
  && mkdir -p node_modules/.cache/mongodb-memory-server \
  && ln -f <your checkout>/node_modules/.cache/mongodb-memory-server/mongod-* \
       node_modules/.cache/mongodb-memory-server/
```

What each part does:

- `git submodule update --init --depth 50`: private submodules need your git
  credentials, which workers do not have, so you fetch them here.
- `npx "<packageManager>"`: uses the exact pnpm version pinned in `package.json`.
- `--frozen-lockfile --prefer-offline`: pnpm hard-links from its store, so there
  are no downloads and almost no disk use.
- `MONGOMS_DISABLE_POSTINSTALL=1` and the hard link: reuse your checkout's
  `mongod` binary instead of downloading it twice per worker.

Hosts this repo's setup reaches, for an allowlist: `github.com` (submodules),
`registry.npmjs.org` (pnpm), `fastdl.mongodb.org` (the test database binary),
and for its live Docker stack (lead only) `registry-1.docker.io` and `ghcr.io`.

## The same idea elsewhere

| Stack | Install from cache | Cache to share |
|---|---|---|
| pnpm | `pnpm install --frozen-lockfile --prefer-offline` | the pnpm store (shared by default) |
| npm | `npm ci --prefer-offline` | `~/.npm` (shared by default) |
| Yarn (Berry) | `yarn install --immutable` | the global cache, or `.yarn/cache` if checked in |
| uv | `uv sync --frozen` | uv's cache (shared, hard-linked) |
| Poetry | `poetry install --sync` | Poetry's cache |
| Cargo | `cargo fetch --locked` | `~/.cargo/registry`. Set `CARGO_TARGET_DIR` per worker, or builds lock each other |
| Go | `go mod download` | `GOMODCACHE` (shared by default) |
| Playwright | `npx playwright install` once | `~/.cache/ms-playwright` (shared by default) |

## Check before you scale

1. Run one test file in the new worktree, offline if you can. Whatever it still
   downloads is the next cache to share.
2. Run the same test file in two worktrees at once. If one fails, the tests
   share something (a fixed port, a temp path, a database name). Fix that, or
   put those tasks in a single worker's queue.
3. Workers inherit your `PATH`: put the repo's tool versions (`.nvmrc`,
   `.python-version`, `rust-toolchain.toml`) first before you spawn.
