# @taka/types

Shared TypeScript type definitions used across all Taka packages.

## Overview

This package contains the canonical interfaces for sessions, events, network requests, screenshots, and visual diffs. Every other package depends on these types to ensure consistent data shapes across the recorder, player, differ, API, and web dashboard.

## Key Exports

| Type | Description |
|------|-------------|
| `SessionEvent` | A single recorded user interaction (click, input, scroll, navigation, mutation, mousemove, focus, blur, submit, resize) |
| `SessionData` | Complete session recording: events, network requests, metadata, and storage snapshot |
| `NetworkRequest` | Captured HTTP request with method, URL, headers, body, and response |
| `SessionMetadata` | Browser, viewport, and page metadata for a session |
| `StorageSnapshot` | localStorage, sessionStorage, and cookies captured at recording start |
| `Screenshot` | Screenshot file metadata (id, sessionId, path, eventIndex) |
| `TestResult` | Visual test execution result with status, screenshots, and diffs |
| `VisualDiff` | Pixel comparison result between baseline and head screenshots |
| `RecorderConfig` | Configuration interface for the recorder SDK |

## Usage

```typescript
import type { SessionData, SessionEvent, StorageSnapshot } from '@taka/types';

const session: SessionData = {
  id: 'session-abc123',
  url: 'https://example.com',
  timestamp: Date.now(),
  events: [],
  networkRequests: [],
  metadata: {
    userAgent: navigator.userAgent,
    viewport: { width: 1920, height: 1080 },
    url: 'https://example.com',
  },
};
```

## Adding a New Type

1. Add the interface to `src/index.ts`
2. Run `pnpm build` from the repo root (or this package directory)
3. Consumers automatically pick up the new type via the workspace alias

## Build

```bash
pnpm build       # Compile TypeScript to dist/
pnpm type-check  # Type-check without emitting
```
