# @taka/worker

Reserved package for an out-of-process background job worker.

## Status

**Stub — not implemented.** All background work currently runs in-process inside `@taka/api` via a `p-queue` job queue. This package exists as a placeholder for the future split, when test execution and diffing should be moved off the API process.

Today, `src/index.ts` is a single `console.log` line confirming the placeholder.

## Intended scope

When implemented, the worker will:

- Pull queued test runs from a shared store (initially the filesystem, eventually Redis or a real queue)
- Execute replays via `@taka/player`
- Run pixel diffs via `@taka/differ`
- Write results back to the same storage layout the API uses
- Allow horizontal scaling by running multiple worker processes

## Why split it out later

- Long replays should not block API request handling
- Multiple workers can run replays in parallel across machines
- Replay processes can be recycled independently if Puppeteer leaks memory
- Production deployments can scale workers and the API on different schedules

## Build

```bash
pnpm build       # Compile (no-op stub)
pnpm dev         # nodemon stub
pnpm type-check  # Type-check
```
