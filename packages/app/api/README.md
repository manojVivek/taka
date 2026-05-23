# @taka/api

Express-based REST API server. Receives recorded sessions, runs replays through Puppeteer, performs visual diffs, and exposes everything to the web dashboard. Persistence is pluggable via `@taka/storage`.

## Overview

The API is the central service of the platform. It accepts session uploads from the recorder, stores them through the `Storage` interface, and orchestrates test execution by combining `@taka/player` (replay) and `@taka/differ` (visual comparison). All test execution runs in-process via a `p-queue` job queue — no separate worker process is required for the POC.

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

### Sessions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions` | Upload a session from the recorder |
| `GET` | `/api/sessions` | List sessions (paginated) |
| `GET` | `/api/sessions/stats` | Aggregate session statistics |
| `GET` | `/api/sessions/search?q=` | Full-text search by URL/title |
| `GET` | `/api/sessions/:id` | Get session details |
| `DELETE` | `/api/sessions/:id` | Delete a session and its assets |
| `POST` | `/api/sessions/:id/replay` | Queue a replay-as-test for this session |

### Tests

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tests` | List test runs (filterable by status) |
| `GET` | `/api/tests/queue` | In-progress job queue status |
| `GET` | `/api/tests/:id` | Get a single test status |
| `GET` | `/api/tests/:id/result` | Test results (screenshots, diffs, pass/fail) |
| `POST` | `/api/tests/run` | Run a test from raw session data |
| `POST` | `/api/tests/compare` | Compare screenshots between two sessions |

### Health & blob serving

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Liveness probe |
| `GET` | `/api/health/ready` | Readiness probe |
| `GET` | `/api/user-sessions/:sessionId/screenshots/:filename` | Baseline screenshot PNG (404 if absent or storage backend doesn't keep it) |
| `GET` | `/api/test-sessions/:testId/screenshots/:filename` | Test-run screenshot PNG |
| `GET` | `/api/test-sessions/:testId/diffs/:filename` | Diff image PNG |

The blob endpoints stream bytes from the storage layer — `express.static` is no longer used, so they work uniformly across any backend.

## Services

| Service | Responsibility |
|---------|----------------|
| `SessionService` | Thin façade over `Storage` for session CRUD, search, stats, baseline flag |
| `TestService` | Queue and execute replay tests, run visual comparisons, persist results — all via `Storage` |

Both services receive a `Storage` instance via constructor injection in `src/index.ts`.

## Storage Layout (`file` backend)

```
data/
├── user-sessions/
│   ├── index.json              # Map<sessionId, SessionSummary>, rebuilt from disk on startup if missing
│   └── <sessionId>/
│       ├── session.json        # Recorded SessionData
│       └── screenshots/        # Baseline screenshots (created on first replay)
└── test-sessions/
    └── <testId>/
        ├── result.json         # TestResult metadata
        ├── screenshots/        # Replay screenshots
        └── diffs/
            ├── report.json     # DiffReport summary
            └── diff_*.png      # Per-pair diff images
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
