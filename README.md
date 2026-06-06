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
| `@taka/test-fixture` | `packages/app/test-fixture` | Minimal HTML fixture + hermetic end-to-end test | [README](packages/app/test-fixture/README.md) |
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
| Web dashboard | 9000 | http://localhost:9000 |
| API server | 9001 | http://localhost:9001 |

Open http://localhost:9000 to see the dashboard. To generate a session, run the end-to-end flow (`make e2e`) or start the fixture standalone (`make fixture`) and click its button.

## Workflow

### Automated (recommended)

`make e2e` runs the whole pipeline hermetically: it spawns its own API + fixture + Chrome on a temp data dir, records a click, then asserts **record → baseline → unchanged-passes → regression-fails**, and tears everything down. Exit code 0 means the pipeline is healthy end to end.

`make e2e-keep` runs the same flow but leaves everything running afterward — the API, the three fixed-mode fixtures (stable `:9002`, preview `:9003`, regression `:9004`), and the dashboard (pre-populated with the recorded sessions + test runs). Record your own sessions on the stable origin, then Replay from the dashboard targeting the preview (passes) or regression (fails) origin; Ctrl+C tears it down. See [`packages/app/test-fixture/README.md`](packages/app/test-fixture/README.md) for the full architecture.

### Manual

1. **Record** — `make fixture` (serves the button page on :9002), open it, click. The recorder ships the session to the API.
2. **Browse** — sessions appear at http://localhost:9000.
3. **Replay** — click "Replay" on a session; the API uses `@taka/player` to re-run it in headless Chrome and capture screenshots.
4. **Diff** — when a baseline exists, `@taka/differ` compares head vs baseline and reports pass/fail.
5. **Review** — visual diffs show up under the project's tests.

## Make targets

The project ships a `Makefile` with common operations. Always prefer these over raw `pnpm`/`node` commands so the workflow stays consistent.

| Target | Description |
|--------|-------------|
| `make install` | Install workspace dependencies |
| `make dev` | Start API + web together (concurrency 20) |
| `make build` | Build all packages (incl. the recorder browser bundle) |
| `make e2e` | Hermetic end-to-end test (record → baseline → pass → regression-fail) |
| `make e2e-headful` | Same, with a visible browser for debugging |
| `make e2e-keep` | Run the flow, then leave API + the 3 fixed-mode fixtures + dashboard up to explore (Ctrl+C to tear down) |
| `make fixture` | Run the test fixture standalone on :9002 for manual recording |
| `make kill` | Kill dev/e2e ports (9000–9004) |
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
  - Cross-origin replay — rebase a recorded session onto an arbitrary `targetOrigin` (a Vercel-style preview, staging, or local dev) without rewriting stored data; same-origin URLs follow the target, cross-origin URLs stay as recorded
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
  - Optional `targetOrigin` on replay — normalized + validated server-side — to run a session against a preview/staging deployment; the result records `targetOrigin`/`sourceOrigin`
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
  - Terminal/devtool aesthetic — sharp corners, dark-mode-first, lime accent
  - Type system: JetBrains Mono (ui/code) + Space Grotesk (display) + IBM Plex Sans (prose) via `next/font/google`
  - Theme toggle (dark ↔ light) with FOUC-prevention bootstrap script and localStorage persistence
  - Projects landing (`/`) with grid of project cards, search, "new project" modal
  - Per-project dashboard (`/projects/[id]`) — stat tiles, recent sessions, live queue widget
  - Sessions list with search/sort/pagination
  - Session detail with metadata strip, recorded-origin, baseline-frame flipstrip gallery (click/←→ to flip an inline preview), event-density sparkline, filtered event timeline, network panel
  - Replay-target dialog on every replay trigger (sessions list, session detail, dashboard) — prefilled with the recorded origin, accepts a preview URL; the session's recorded origin is surfaced in the session view and the test detail shows `target:` for cross-origin runs
  - Tests list with status filter, mini frame-strip per row, 2s polling
  - Test detail (the hero) — three-up Baseline/Head/Diff viewer with frame list, jump-to-failure, frame-strip filmstrip
  - Getting-started — install snippet pre-filled with the project's id, live "waiting for first session" panel that auto-redirects on arrival
  - Settings — rename, accent color (read-only, derived from id), delete with typed-confirmation
  - Project switcher in the sidebar (dropdown with all projects + back-to-list)
- **Test fixture + e2e** (`@taka/test-fixture`)
  - Minimal deterministic button page with the recorder wired in via a `<script>` tag
  - Server-side "regression mode" that flips the output to a red background for a guaranteed visual diff
  - Hermetic `make e2e` orchestrator: spawns API + fixture + Chrome, records, and asserts record → baseline → pass → regression-fail
  - Three fixed-mode fixtures (stable/preview/regression on separate ports) — each scenario records on stable, then replays cross-domain against preview (pass) and regression (fail); scenarios run in parallel

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
7. Multi-origin replay map (`{sourceA: targetA, …}`) for micro-frontends / app+API previews — a clean extension of the single-`targetOrigin` rebasing

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
