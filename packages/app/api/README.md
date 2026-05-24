# @taka/api

Express-based REST API server. Receives recorded sessions, runs replays through Puppeteer, performs visual diffs, and exposes everything to the web dashboard. Data is organized under **projects** as the top-level umbrella; persistence is pluggable via `@taka/storage`.

## Overview

The API receives session uploads from the recorder, stores them through the `Storage` interface, and orchestrates test execution by combining `@taka/player` (replay) and `@taka/differ` (visual comparison). All test execution runs in-process via a `p-queue` job queue — no separate worker process is required for the POC.

Every session and test belongs to a project. Projects are a data-partitioning concept, not an access-control one — there is no authentication yet. Projects must be created explicitly via `POST /api/projects`; there is no implicit default project. Every request that names a `:projectId` is gated by a middleware that returns `404` if the project doesn't exist.

Storage is chosen at boot via the `TAKA_STORAGE` env var (`file` for the default filesystem layout, `logOnly` for a debug backend that just logs every call). New backends drop in by implementing the `@taka/storage` interface.

Runs on **http://localhost:3001** by default.

## Tech Stack

- **Express 5** + Helmet + CORS
- **TypeScript** throughout
- **p-queue** for in-process job queueing (concurrency: 2)
- **`@taka/storage`** for persistence — no direct filesystem access in this package
- Embeds `@taka/player` and `@taka/differ` for replay and diffing

## Configuration

| Env var | Default | Effect |
|---------|---------|--------|
| `PORT` | `3001` | HTTP listen port |
| `TAKA_STORAGE` | `file` | Storage backend: `file` (filesystem under `./data/`) or `logOnly` (debug — logs every call, persists nothing) |
| `CHROME_PATH` | `/Applications/Google Chrome.app/...` | Override Chrome binary used by Puppeteer |
| `NODE_ENV` | — | When set to `development`, error responses include the underlying message |

## API Endpoints

Every session, test, and blob endpoint lives under `/api/projects/:projectId/...`. There are no unscoped variants — clients must reference an existing project. Hitting a project-scoped URL with a `:projectId` that doesn't exist returns `404 Project not found`.

### Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create a project (body: `{ name, description?, id? }`) |
| `GET` | `/api/projects/:projectId` | Get a project |
| `PATCH` | `/api/projects/:projectId` | Rename or update description |
| `DELETE` | `/api/projects/:projectId` | Delete a project (cascades to all sessions, tests, and blobs) |

### Sessions (project-scoped)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/projects/:projectId/sessions` | Upload a session from the recorder |
| `GET` | `/api/projects/:projectId/sessions` | List sessions (paginated) |
| `GET` | `/api/projects/:projectId/sessions/stats` | Aggregate session statistics for the project |
| `GET` | `/api/projects/:projectId/sessions/search?q=` | Full-text search by URL/title within the project |
| `GET` | `/api/projects/:projectId/sessions/:id` | Get session details |
| `DELETE` | `/api/projects/:projectId/sessions/:id` | Delete a session and its assets |
| `POST` | `/api/projects/:projectId/sessions/:id/replay` | Queue a replay-as-test for this session |

### Tests (project-scoped)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:projectId/tests` | List test runs (filterable by status) |
| `GET` | `/api/projects/:projectId/tests/queue` | In-progress job queue status for this project |
| `GET` | `/api/projects/:projectId/tests/:id` | Get a single test status |
| `GET` | `/api/projects/:projectId/tests/:id/result` | Test results (screenshots, diffs, pass/fail) |
| `POST` | `/api/projects/:projectId/tests/run` | Run a test from raw session data |
| `POST` | `/api/projects/:projectId/tests/compare` | Compare baselines between two sessions in the project |

### Blob endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:projectId/user-sessions/:sessionId/screenshots/:filename` | Baseline screenshot PNG |
| `GET` | `/api/projects/:projectId/test-sessions/:testId/screenshots/:filename` | Test-run screenshot PNG |
| `GET` | `/api/projects/:projectId/test-sessions/:testId/diffs/:filename` | Diff image PNG |

The blob endpoints stream bytes from the storage layer (no `express.static`) so they work uniformly across any backend.

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Liveness probe |
| `GET` | `/api/health/ready` | Readiness probe (includes project count and default-project stats) |

## Services

| Service | Responsibility |
|---------|----------------|
| `SessionService` | Façade over `Storage` — project CRUD, session CRUD/search/stats, baseline flag |
| `TestService` | Queue and execute replay tests, run visual comparisons, persist results — scoped per project |

Both services take a `Storage` instance via constructor injection in `src/index.ts`.

## Storage Layout (`file` backend)

```
data/projects/
├── projects.json
└── <projectId>/
    ├── user-sessions/
    │   ├── index.json
    │   └── <sessionId>/
    │       ├── session.json
    │       └── screenshots/*.png
    └── test-sessions/
        └── <testId>/
            ├── result.json
            ├── screenshots/*.png
            └── diffs/
                ├── report.json
                └── diff_*.png
```

With `TAKA_STORAGE=logOnly`, none of these files are created — every `Storage` call is logged to stdout instead.

## Running locally

```bash
pnpm dev    # nodemon watch mode (TAKA_STORAGE defaults to file)
pnpm build  # Compile to dist/
pnpm start  # Run compiled output

# Debug backend
TAKA_STORAGE=logOnly pnpm dev
```

Or from the repo root: `make dev` (starts API + web + test-app together).

## Health check

```bash
make health
# or
curl -s http://localhost:3001/api/health | jq
```
