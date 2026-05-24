# @taka/storage

Pluggable persistence layer for the Taka platform. One `Storage` interface covers **projects**, sessions, baselines, test results, screenshots, diffs, and reports. Concrete implementations swap behind it without changes to the API server, services, player, or differ.

## Project hierarchy

Sessions, baselines, and test runs are all scoped under a parent **project**. Every method on the `Storage` interface that touches session or test data takes a `projectId` as its first argument. Project CRUD lives directly on the interface alongside the data methods.

Projects must be created explicitly via `createProject()` (or `POST /api/projects` at the HTTP layer) — no implicit default project is created on boot. Calling a data method with an unknown `projectId` throws (in `FileStorage`) so the API layer can translate it into a 404.

## Implementations

| Kind | Class | Behaviour |
|------|-------|-----------|
| `file` | `FileStorage` | Reads/writes the local filesystem under `projectsRoot/<projectId>/{user-sessions,test-sessions}/...`. Default for development. |
| `logOnly` | `LogOnlyStorage` | Logs every call to stdout. All writes are no-ops; all reads return `null`/`[]`. Useful for inspecting the API surface without touching disk. |

Future implementations (DB-backed metadata + cloud object store for blobs) plug in by implementing the same `Storage` interface.

## Usage

```typescript
import { createStorage } from '@taka/storage';
import { STORAGE_PATHS } from '@taka/constants';

const storage = createStorage(process.env.TAKA_STORAGE ?? 'file', {
  file: { projectsRoot: STORAGE_PATHS.projectsRoot },
});

await storage.initialize();   // creates 'default' project if missing

// Projects
await storage.createProject({ id: 'notes', name: 'Notes App', createdAt: Date.now() });
const all = await storage.listProjects();
await storage.deleteProject('notes');   // cascades — removes all sessions/tests/blobs

// Sessions (project-scoped)
await storage.saveSession('notes', sessionData);
const session = await storage.getSession('notes', 'abc-123');
const { items, total } = await storage.listSessions('notes', { limit: 20, offset: 0 });

// Baselines (image bytes go through the interface, not paths)
await storage.putBaselineScreenshot('notes', sessionId, '0001_initial_123.png', pngBuffer);
const baseline = await storage.getBaselineScreenshot('notes', sessionId, '0001_initial_123.png');

// Test runs
await storage.saveTestResult('notes', testId, testResult);
await storage.putTestScreenshot('notes', testId, filename, pngBuffer);
await storage.putTestDiff('notes', testId, diffFilename, diffBuffer);
await storage.putTestDiffReport('notes', testId, report);
```

## On-disk layout (`file` backend)

```
<projectsRoot>/
├── projects.json                     # Map<projectId, Project> index
└── <projectId>/
    ├── user-sessions/
    │   ├── index.json                # per-project session summary index
    │   └── <sessionId>/
    │       ├── session.json
    │       └── screenshots/*.png
    └── test-sessions/
        └── <testId>/
            ├── result.json
            ├── screenshots/*.png
            └── diffs/
                ├── report.json
                └── *.png
```

`<projectsRoot>` defaults to `<DATA_ROOT>/projects` via `STORAGE_PATHS.projectsRoot`.

## Why a single interface

Projects, sessions, baselines, and test runs are tightly coupled — a baseline only exists in the context of a session, a diff only in the context of a test, and both belong to a project. Splitting into `ProjectStore` + `SessionStore` + `ScreenshotStore` would just force every implementation to coordinate across multiple objects. One unified interface keeps each backend in one file.

## Selecting a backend

The api server reads `TAKA_STORAGE`:

```bash
make dev                          # defaults to file
TAKA_STORAGE=logOnly make dev     # storage operations log to stdout, nothing persists
```
