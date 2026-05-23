# @taka/api

Express-based REST API server. Stores recorded sessions, runs replays through Puppeteer, performs visual diffs, and exposes everything to the web dashboard.

## Overview

The API is the central service of the platform. It receives session uploads from the recorder, persists them to the filesystem, and orchestrates test execution by combining `@taka/player` (replay) and `@taka/differ` (visual comparison). All test execution runs in-process via a `p-queue` job queue — no separate worker process is required for the POC.

Runs on **http://localhost:3001** by default.

## Tech Stack

- **Express 5** + Helmet + CORS
- **TypeScript** throughout
- **p-queue** for in-process job queueing (concurrency: 2)
- **fs-extra** for file-based storage under `./data/`
- Embeds `@taka/player` and `@taka/differ` for replay and diffing

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

### Health & static

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Liveness probe |
| `GET` | `/api/health/ready` | Readiness probe |
| `GET` | `/api/user-sessions/*` | Serve user session files (JSON, screenshots) |
| `GET` | `/api/test-sessions/*` | Serve test session files (screenshots, diffs) |

## Services

| Service | Responsibility |
|---------|----------------|
| `SessionService` | Persist, index, search, and retrieve recorded sessions; manage baselines |
| `TestService` | Queue and execute replay tests, run visual comparisons, persist results |

## Storage Layout

```
data/
├── user-sessions/
│   └── <sessionId>/
│       ├── session.json       # Recorded SessionData
│       └── screenshots/       # (only if a baseline was captured)
└── test-sessions/
    └── <testId>/
        ├── result.json        # TestResult metadata
        ├── screenshots/       # Replay screenshots
        └── diffs/             # Pixel-diff images
```

## Running locally

```bash
pnpm dev    # nodemon watch mode
pnpm build  # Compile to dist/
pnpm start  # Run compiled output
```

Or from the repo root: `make dev` (starts API + web + test-app together).

## Health check

```bash
make health
# or
curl -s http://localhost:3001/api/health | jq
```
