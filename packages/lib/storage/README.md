# @taka/storage

Pluggable persistence layer for the Taka platform. One `Storage` interface covers sessions, baselines, test results, screenshots, diffs, and reports. Concrete implementations swap behind it without changes to the API server, services, player, or differ.

## Implementations

| Kind | Class | Behaviour |
|------|-------|-----------|
| `file` | `FileStorage` | Reads/writes the local filesystem under configured `userSessionsPath` and `testSessionsPath`. Default for development. |
| `logOnly` | `LogOnlyStorage` | Logs every call to stdout. All writes are no-ops; all reads return `null`/`[]`. Useful for inspecting the API surface without touching disk. |

Future implementations (DB-backed metadata + cloud object store for blobs) plug in by implementing the same `Storage` interface.

## Usage

```typescript
import { createStorage } from '@taka/storage';
import { STORAGE_PATHS } from '@taka/constants';

const storage = createStorage(process.env.TAKA_STORAGE ?? 'file', {
  file: {
    userSessionsPath: STORAGE_PATHS.userSessions,
    testSessionsPath: STORAGE_PATHS.testSessions,
  },
});

await storage.initialize();

// Sessions
await storage.saveSession(sessionData);
const session = await storage.getSession('abc-123');
const { items, total } = await storage.listSessions({ limit: 20, offset: 0 });

// Baselines (image bytes go through the interface, not paths)
await storage.putBaselineScreenshot(sessionId, '0001_initial_123.png', pngBuffer);
const baseline = await storage.getBaselineScreenshot(sessionId, '0001_initial_123.png');

// Test runs
await storage.saveTestResult(testId, testResult);
await storage.putTestScreenshot(testId, filename, pngBuffer);
await storage.putTestDiff(testId, diffFilename, diffBuffer);
await storage.putTestDiffReport(testId, report);
```

## Why a single interface

Sessions, baselines, and test runs are tightly coupled — a baseline only exists in the context of a session, a diff only in the context of a test. Splitting into `SessionStore` + `ScreenshotStore` would just force every implementation to coordinate across two objects. One unified interface keeps each backend in one file.

## Selecting a backend

The api server reads `TAKA_STORAGE`:

```bash
make dev                          # defaults to file
TAKA_STORAGE=logOnly make dev     # storage operations log to stdout, nothing persists
```
