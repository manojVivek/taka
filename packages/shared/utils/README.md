# @taka/utils

Shared utility functions used across all Taka packages.

## Overview

A small collection of helpers for ID generation, caching, timing, formatting, and basic browser detection. Designed to work in both Node.js (API, worker, player) and browser (recorder) environments.

## Key Exports

| Function | Description |
|----------|-------------|
| `generateId()` | Generate a UUID v4 string |
| `createCache(options)` | Create an LRU cache instance with TTL support |
| `debounce(fn, ms)` | Debounce a function — fires after `ms` of no calls |
| `throttle(fn, ms)` | Throttle a function — fires at most once per `ms` |
| `sleep(ms)` | Promise-based delay |
| `formatBytes(bytes)` | Convert bytes to human-readable string (e.g., `1.5 KB`) |
| `sanitizeFilename(name)` | Strip unsafe characters from a filename |
| `parseUserAgent(ua)` | Extract browser and OS info from a User-Agent string |

## Usage

```typescript
import { generateId, createCache, debounce, sleep } from '@taka/utils';

// Generate an ID
const sessionId = generateId();

// Create a cache
const cache = createCache({ max: 500, ttl: 1000 * 60 * 5 });
cache.set('key', 'value');

// Debounce a frequently-called function
const debouncedSave = debounce(saveToServer, 1000);

// Wait
await sleep(500);
```

## Dependencies

- `lru-cache` — backing store for `createCache`
- `uuid` — UUID v4 generation

## Build

```bash
pnpm build       # Compile TypeScript to dist/
pnpm type-check  # Type-check without emitting
```
