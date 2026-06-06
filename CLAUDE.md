# Taka - Complete Implementation Plan

## Project Overview
Building Taka — an automated visual frontend testing platform that records user sessions, replays them as tests, and detects visual regressions without requiring manual test writing or maintenance.

**Data hierarchy (current):** Every session and test lives under a parent **project**. Projects are a partitioning concept only — no authentication or per-project permissions. Every API request is project-scoped (`/api/projects/:projectId/...`); there is no implicit default project and no legacy unscoped routes — projects must be created explicitly via `POST /api/projects`, and the recorder requires a `projectId` at init time.

## Project Structure (Monorepo)

```
taka/
├── packages/
│   ├── shared/
│   │   ├── utils/           # Shared utility functions
│   │   ├── types/           # TypeScript type definitions
│   │   └── constants/       # Shared constants
│   ├── lib/
│   │   ├── recorder/        # Session recording SDK
│   │   ├── player/          # Session replay engine
│   │   └── differ/          # Visual diff algorithms
│   └── app/
│       ├── web/             # Main web dashboard (Next.js)
│       ├── api/             # Backend API service
│       └── worker/          # Background job processing
├── CLAUDE.md                # Project documentation and plan
├── package.json             # Root workspace configuration
├── pnpm-workspace.yaml      # PNPM workspace config
├── turbo.json              # Turborepo configuration
└── docker-compose.yml      # Local services orchestration (PostgreSQL only)
```

## Tech Stack & Architecture (Minimal POC)

### Monorepo Management
- **Package Manager**: PNPM for efficient dependency management
- **Build System**: Turborepo for fast, cached builds
- **Shared Libraries**: Internal packages for code reuse

### Core Technologies (Redis-Free POC)
- **Frontend**: Next.js 14 with App Router
- **Backend**: Node.js with Express/Fastify
- **Database**: SQLite for POC (PostgreSQL ready)
- **Cache**: In-memory cache (Map/LRU cache)
- **Queue**: In-process job queue (p-queue or bee-queue-lite)
- **Storage**: Local filesystem
- **Browser**: Puppeteer/Playwright (local Chrome)
- **Language**: TypeScript throughout

## Simplified Local Development

### Minimal Dependencies
```yaml
# docker-compose.yml (optional - only if using PostgreSQL)
services:
  postgres:    # Optional - can use SQLite instead
```

### Storage Strategy (No Redis)
- **Database**: SQLite by default, PostgreSQL optional
- **Sessions**: SQLite + local filesystem
- **Queue**: In-memory queue with file-based persistence
- **Cache**: Simple in-memory LRU cache
- **Screenshots**: Local filesystem

## Detailed Implementation Plan

### Phase 1: Monorepo Setup & Minimal Infrastructure

1. **Initialize Monorepo**
   - Set up PNPM workspaces
   - Configure Turborepo
   - Set up shared TypeScript config
   - Configure ESLint & Prettier

2. **Minimal Local Setup**
   - SQLite database (no Docker required)
   - File-based storage structure
   - In-memory caching solution

3. **Create Shared Packages**
   - `@taka/utils`: Common utilities
   - `@taka/types`: Shared TypeScript types
   - `@taka/constants`: Configuration constants

### Phase 2: Recording Library (`packages/lib/recorder`)

1. **Event Capture System**
   - DOM mutation observer
   - Click, input, scroll event listeners
   - Network request/response interceptors
   - Storage API monitoring

2. **Local Data Transmission**
   - Direct POST to local API (http://localhost:9001)
   - Batch uploads to reduce requests
   - Local buffer for offline recording

3. **SDK Interface**
   ```typescript
   TakaRecorder.init({
     apiEndpoint: 'http://localhost:9001',
     uploadInterval: 5000,
     maxBatchSize: 100,
     localStorage: true  // Use localStorage for buffering
   })
   ```

### Phase 3: Backend Services (`packages/app/api`)

1. **Simplified API Design**
   - Single Express/Fastify server
   - SQLite with better-sqlite3
   - In-memory job queue
   - File-based session storage

2. **In-Memory Queue Implementation**
   ```typescript
   import PQueue from 'p-queue';
   
   class SimpleJobQueue {
     private queue = new PQueue({ concurrency: 2 });
     private jobs = new Map();
     
     async addJob(type: string, data: any) {
       const jobId = uuid();
       this.jobs.set(jobId, { status: 'pending', data });
       
       await this.queue.add(async () => {
         await this.processJob(jobId, type, data);
       });
       
       return jobId;
     }
   }
   ```

3. **Simple Cache Implementation**
   ```typescript
   import LRU from 'lru-cache';
   
   const cache = new LRU<string, any>({
     max: 500,
     ttl: 1000 * 60 * 5 // 5 minutes
   });
   ```

### Phase 4: Replay Engine (`packages/lib/player`)

1. **Synchronous Processing**
   - Process replay requests immediately
   - No background workers initially
   - Simple async/await flow

2. **Local Screenshot Storage**
   ```typescript
   class ScreenshotManager {
     private basePath = './data/screenshots';
     
     async save(sessionId: string, screenshot: Buffer) {
       const dir = path.join(this.basePath, sessionId);
       await fs.ensureDir(dir);
       const filename = `${Date.now()}.png`;
       await fs.writeFile(path.join(dir, filename), screenshot);
       return filename;
     }
   }
   ```

### Phase 5: Visual Regression (`packages/lib/differ`)

1. **Simple Image Comparison**
   - Pixelmatch for image diffing
   - Synchronous processing
   - Results stored in SQLite

2. **In-Process Diffing**
   ```typescript
   import pixelmatch from 'pixelmatch';
   
   function compareImages(img1: Buffer, img2: Buffer) {
     // Direct comparison without queue
     const diff = pixelmatch(img1, img2, null, width, height);
     return { difference: diff, percentage: diff / (width * height) };
   }
   ```

### Phase 6: Web Dashboard (`packages/app/web`)

1. **Simplified Features**
   - Next.js with API routes (no separate API needed)
   - SQLite database in Next.js API
   - Direct file access for images
   - Basic authentication with cookies

2. **Integrated Architecture**
   ```typescript
   // pages/api/sessions.ts
   import { db } from '@/lib/db'; // SQLite instance
   
   export default async function handler(req, res) {
     const sessions = await db.all('SELECT * FROM sessions');
     res.json(sessions);
   }
   ```

### Phase 7: Integrated Worker (`packages/app/api`)

1. **In-Process Background Tasks**
   ```typescript
   // Simple background task processor
   class TaskProcessor {
     private tasks: Map<string, Promise<any>> = new Map();
     
     async processInBackground(taskId: string, fn: () => Promise<any>) {
       const promise = fn();
       this.tasks.set(taskId, promise);
       
       promise.finally(() => {
         this.tasks.delete(taskId);
       });
       
       return taskId;
     }
     
     async getStatus(taskId: string) {
       return this.tasks.has(taskId) ? 'processing' : 'complete';
     }
   }
   ```

2. **Resource Management**
   - Limit concurrent Puppeteer instances
   - Simple semaphore for parallelism
   - Memory-based task tracking

## Development Workflow

1. **Zero-Dependency Setup**
   ```bash
   # No Docker required!
   git clone [repo]
   cd taka
   pnpm install
   pnpm dev           # Starts everything
   ```

2. **Single Service Architecture**
   - Web + API in one Next.js app: http://localhost:9000
   - API routes: http://localhost:9000/api/*
   - Static assets: http://localhost:9000/*

3. **Data Persistence**
   - SQLite DB: ./data/db.sqlite
   - Screenshots: ./data/screenshots/
   - Recordings: ./data/recordings/
   - Diffs: ./data/diffs/

## Key Features (Ultra-Simple POC)

1. **Zero External Dependencies**
   - No Docker required
   - No Redis needed
   - No PostgreSQL for POC
   - Just Node.js and Chrome

2. **Simple State Management**
   ```typescript
   // In-memory state with file backup
   class SimpleStore {
     private data = new Map();
     private backupFile = './data/store.json';
     
     async load() {
       if (await fs.pathExists(this.backupFile)) {
         const data = await fs.readJson(this.backupFile);
         this.data = new Map(data);
       }
     }
     
     async save() {
       await fs.writeJson(this.backupFile, [...this.data]);
     }
   }
   ```

3. **Development Mode Features**
   - Hot reload everywhere
   - In-memory everything for speed
   - File persistence for restart survival

## Environment Variables (Minimal)

```env
# Simple .env file
NODE_ENV=development
DATABASE_URL=sqlite:./data/db.sqlite
STORAGE_PATH=./data
PORT=9000
```

## Migration Path

### From POC to Production:

1. **Phase 1 (Current POC)**
   - SQLite → Keep for dev
   - In-memory queue → Works for POC
   - File storage → Good enough

2. **Phase 2 (Validation)**
   - Add PostgreSQL option
   - Add optional Redis
   - Keep in-memory as fallback

3. **Phase 3 (Scale)**
   - PostgreSQL primary
   - Redis for queue/cache
   - S3 for storage
   - Separate worker service

## POC Validation Metrics

- Can record 100+ sessions
- Can replay sessions accurately  
- Can detect visual differences
- Can process 10 sessions in parallel
- UI is responsive with 1000 sessions

## Simple Start Commands

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "start": "node packages/app/web/.next/standalone/server.js",
    "reset": "rm -rf ./data && mkdir -p ./data"
  }
}
```

## Tech Decisions

### Monorepo Structure
- Using PNPM workspaces for efficient dependency management
- Turborepo for fast, cached builds
- Shared packages in `./packages/shared/` for utilities, types, constants
- Libraries in `./packages/lib/` for recorder, player, differ
- Applications in `./packages/app/` for web dashboard

### Local-First Architecture
- Everything runs locally without external cloud services initially
- SQLite for database (PostgreSQL ready for production)
- In-memory cache and queues (Redis ready for scale)
- Local filesystem storage (S3 ready for cloud)
- No external dependencies during POC phase

This ultra-simplified architecture removes Redis entirely and uses in-memory/file-based solutions perfect for POC validation. Once validated, you can gradually add Redis, PostgreSQL, and other production components.

## Development Workflow Notes

### Use the Makefile for repeated commands
Always use `make` targets instead of running raw commands. The project Makefile has targets for all common operations:

- `make dev` — Start dev servers (API 9001, Web 9000)
- `make build` — Build all packages (incl. the recorder browser bundle)
- `make e2e` — Hermetic end-to-end test (record → baseline → pass → regression-fail)
- `make e2e-headful` — Same, with a visible browser for debugging
- `make e2e-keep` — Run the flow, then leave API + the 3 fixed-mode fixtures (stable :9002, preview :9003, regression :9004) + dashboard up to explore; record on stable, replay against preview/regression (Ctrl+C tears down)
- `make fixture` — Run the test fixture standalone on :9002 for manual recording
- `make kill` — Kill all dev/e2e ports (9000–9004)
- `make health` — Check API health
- `make clean` — Clean build artifacts
- `make reset` — Reset data directory

When adding new frequently-used commands, add them as Makefile targets rather than running ad-hoc shell commands.

### Keep docs in sync after every task

After finishing any non-trivial change — new feature, refactor, API change, new package, removed flag — update the affected docs in the same task. Don't defer it. Documentation drift is treated as part of the change, not a follow-up.

Concretely:

- **`README.md`** (root) — package table, tech stack, project status, roadmap.
- **`packages/<group>/<pkg>/README.md`** — for any package whose public API, file layout, dependencies, or behavior changed. Update the Usage example, API table, and Architecture table so they match the code.
- **`CLAUDE.md`** — when something architectural changes (new package, new env var, new workflow command).
- **API docs / endpoints table** — `packages/app/api/README.md` whenever a route is added, removed, or changes shape.
- **Code examples in docs** — must compile against the current public API. If you change a function signature, grep for it in `**/README.md` and fix every snippet that uses it.

After making code changes, do `grep -rln '<old API name>' **/*.md` to confirm no stale references remain. If a doc references a behavior you removed, either update it to the new behavior or delete the reference — don't leave it dangling.

The point: a teammate (or a future agent) reading the docs should see what the code actually does today, not what it did before the last refactor.
