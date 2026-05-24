# Taka

An automated visual frontend testing platform that records user sessions, replays them as tests, and detects visual regressions without requiring manual test writing or maintenance.

## Architecture

A PNPM + Turborepo monorepo with three layers: shared packages, libraries, and applications. Everything runs locally — no Docker, no Redis, no PostgreSQL required for the POC.

### Packages

| Package | Path | Purpose | Docs |
|---------|------|---------|------|
| `@taka/types` | `packages/shared/types` | Shared TypeScript interfaces | [README](packages/shared/types/README.md) |
| `@taka/utils` | `packages/shared/utils` | UUID, cache, debounce, formatting helpers | [README](packages/shared/utils/README.md) |
| `@taka/constants` | `packages/shared/constants` | Default config and enums | [README](packages/shared/constants/README.md) |
| `@taka/recorder` | `packages/lib/recorder` | Browser session recording SDK | [README](packages/lib/recorder/README.md) |
| `@taka/player` | `packages/lib/player` | Puppeteer-based replay engine | [README](packages/lib/player/README.md) |
| `@taka/differ` | `packages/lib/differ` | Pixelmatch + Sharp visual diffing | [README](packages/lib/differ/README.md) |
| `@taka/storage` | `packages/lib/storage` | Pluggable persistence layer (`FileStorage`, `LogOnlyStorage`) | [README](packages/lib/storage/README.md) |
| `@taka/api` | `packages/app/api` | Express REST API + in-process job queue | [README](packages/app/api/README.md) |
| `@taka/web` | `packages/app/web` | Next.js dashboard | [README](packages/app/web/README.md) |
| `@taka/test-app` | `packages/app/test-app` | Sample notes app for recording targets | [README](packages/app/test-app/README.md) |
| `@taka/worker` | `packages/app/worker` | Stub for future out-of-process worker | [README](packages/app/worker/README.md) |

### Tech Stack

- **Language:** TypeScript end-to-end
- **Package manager:** PNPM workspaces
- **Build system:** Turborepo
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Backend:** Express 5 with Helmet, CORS, p-queue
- **Browser automation:** Puppeteer (headless Chrome)
- **Image processing:** Sharp + Pixelmatch
- **Storage:** Pluggable via `@taka/storage`. Default `FileStorage` writes under `./data/`; `LogOnlyStorage` is available for debug (`TAKA_STORAGE=logOnly`). Future backends (SQLite, S3, etc.) drop in behind the same interface.
- **Cache/queue:** In-memory LRU + in-process p-queue (Redis ready)

## Quick Start

### Prerequisites

- Node.js 18+
- PNPM 8+
- Google Chrome installed at `/Applications/Google Chrome.app/...` (or override with `CHROME_PATH`)

### Setup

```bash
git clone <repo>
cd taka
pnpm install
make dev
```

That starts:

| Service | Port | URL |
|---------|------|-----|
| Web dashboard | 3000 | http://localhost:3000 |
| API server | 3001 | http://localhost:3001 |
| Test-app (recording target) | 3002 | http://localhost:3002 |

Open http://localhost:3000 to see the dashboard, then http://localhost:3002 to interact with the test-app and generate a session.

## Workflow

1. **Record** — open the test-app at :3002, click around. The recorder ships sessions to the API every few seconds.
2. **Browse** — sessions appear at http://localhost:3000/sessions.
3. **Replay** — click "Replay" on a session to queue a test. The API uses `@taka/player` to re-run the session in headless Chrome and capture screenshots.
4. **Diff** — when a baseline exists, `@taka/differ` compares the head screenshots against the baseline and reports pass/fail.
5. **Review** — visual diffs show up at http://localhost:3000/tests.

## Make targets

The project ships a `Makefile` with common operations. Always prefer these over raw `pnpm`/`node` commands so the workflow stays consistent.

| Target | Description |
|--------|-------------|
| `make install` | Install workspace dependencies |
| `make dev` | Start API + web + test-app together (concurrency 20) |
| `make build` | Build all packages |
| `make kill` | Kill ports 3000, 3001, 3002 |
| `make kill-test-app` | Kill just the test-app on port 3002 |
| `make restart-test-app` | Kill and restart test-app in the background |
| `make automate ROUNDS=N DELAY=ms` | Drive the test-app with Puppeteer to generate sessions |
| `make health` | Check API health endpoint |
| `make clean` | Remove `dist/`, `.next/`, and `.turbo/` |
| `make reset` | Wipe `./data/` and recreate session directories |
| `make migrate-data` | Migrate older `data/sessions/` layout to `user-sessions/` + `test-sessions/` |
| `make lint` | Run ESLint across all packages |
| `make typecheck` | Type-check across all packages |

## Project Status

Most of the platform is functional end-to-end. You can record a session, replay it, and view a visual diff today.

### Implemented

- **Monorepo + tooling** — PNPM workspaces, Turborepo pipeline, shared TypeScript config, shared ESLint config
- **Shared packages** — full type definitions, utility helpers, constants
- **Recording SDK** (`@taka/recorder`)
  - DOM events: clicks, inputs, scrolls, mouse moves, focus/blur, submits, resizes, mutations
  - Network capture for both `fetch` and `XMLHttpRequest`
  - Storage snapshot (localStorage, sessionStorage, cookies) for auth restoration
  - Sensitive field filtering (passwords, emails, credit cards)
  - Batched uploads with debounced flush and `beforeunload` handling
  - Per-project upload routing — `projectId` is a required field in the init config; the recorder throws at init if it's missing or empty
  - `__taka_replay` flag to avoid recording during replays
- **Replay engine** (`@taka/player`)
  - Puppeteer-based deterministic replay
  - Auth state restoration (cookies + storage) before navigation
  - JWT `exp` claim patching to prevent client-side expiry redirects
  - Network mocking using recorded responses
  - Screenshot capture at significant events
- **Visual diffing** (`@taka/differ`)
  - Pixelmatch + Sharp pixel comparison
  - Diff image generation
  - Batch screenshot set comparison
  - JSON reports with critical/minor categorization
- **API server** (`@taka/api`)
  - Projects as the top-level umbrella over sessions and tests
  - Project CRUD (`/api/projects`) with cascade delete
  - Project-scoped sessions (`/api/projects/:projectId/sessions`) — CRUD, search, stats
  - Project-scoped test execution (`/api/projects/:projectId/tests/run`, `/api/projects/:projectId/tests/:id`)
  - Every route is project-scoped (`/api/projects/:projectId/...`); requests with an unknown project id return 404
  - In-process job queue with `p-queue`
  - Blob endpoints for screenshots and diffs (streamed through `@taka/storage`, not filesystem-bound)
  - Health/readiness probes
- **Pluggable persistence** (`@taka/storage`)
  - One `Storage` interface covering projects, sessions, baselines, test results, screenshots, diffs, reports
  - `FileStorage` (default) — local filesystem under `./data/projects/<projectId>/...`
  - `LogOnlyStorage` — every call logged to stdout, nothing persisted (for debug)
  - No implicit "default" project — every project is explicitly created via `POST /api/projects`
  - Selected at boot via `TAKA_STORAGE=file|logOnly`
- **Web dashboard** (`@taka/web`)
  - Dashboard with stats and recent sessions
  - Sessions list with pagination, search, sort
  - Session detail page
  - Tests list with status filtering
  - Test detail page with baseline/head/diff viewing
  - Live test queue polling
  - Getting-started page with recorder snippets
- **Test-app** (`@taka/test-app`)
  - Notes CRUD with recorder pre-wired
  - Puppeteer automation script for generating realistic sessions

### In progress / not yet built

- **Out-of-process worker** (`@taka/worker`) — stub only; all jobs currently run inside the API process
- **Authentication / multi-tenant** — single-user local mode only
- **CI/CD integration** — no GitHub/GitLab status checks yet
- **Cloud storage** — local filesystem only (S3/GCS adapters not started)
- **Database** — JSON files only (SQLite/PostgreSQL not wired up)
- **Test approval workflow** — accept/reject diff and update baseline UI

### Roadmap

1. Build the test approval workflow so reviewers can promote a head screenshot to baseline
2. Move test execution into `@taka/worker` so the API stops blocking on Puppeteer (worker consumes the same `@taka/storage` interface)
3. Add a SQLite-backed `Storage` implementation in `@taka/storage` (drop-in alongside `FileStorage`)
4. Add a GitHub Action that runs `pnpm taka test` and posts results on PRs
5. Add an S3-backed `Storage` implementation + screenshot CDN
6. Multi-user auth and per-project session isolation

## Storage Layout

```
data/projects/
├── projects.json                 # Map<projectId, Project> index
└── <projectId>/
    ├── user-sessions/
    │   ├── index.json
    │   └── <sessionId>/
    │       ├── session.json      # Recorded SessionData
    │       └── screenshots/      # Baseline screenshots (when promoted)
    └── test-sessions/
        └── <testId>/
            ├── result.json       # TestResult metadata
            ├── screenshots/      # Replay screenshots
            └── diffs/            # Pixel-diff images + report.json
```

## Design Principles

1. **Local-first** — runs without external services so contributors can move fast
2. **Minimal setup** — `pnpm install && make dev` is the entire onboarding
3. **POC-ready, cloud-ready** — abstractions are picked so each piece can swap to a managed equivalent (filesystem → S3, in-process queue → Redis, JSON → SQL) without rewrites
4. **Use the Makefile** — common commands live there so the workflow is the same for everyone

See [`CLAUDE.md`](CLAUDE.md) for the original implementation plan.
