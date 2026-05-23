# @taka/recorder

Browser-side session recording SDK. Captures DOM events, network traffic, and storage state, then uploads them to the API for replay and visual regression testing.

## Overview

The recorder is the browser-side instrumentation that turns real user sessions into deterministic test fixtures. It runs as a small JavaScript bundle injected into the page (or imported into a React app), buffers everything locally, and ships it to the API in periodic batches.

## What it captures

- **DOM events** — clicks, inputs, scrolls, mouse moves, focus/blur, form submits, viewport resizes, mutations
- **Navigation** — initial page state and subsequent route changes
- **Network requests** — fetch and XMLHttpRequest, including method, URL, headers, body, and response
- **Storage snapshot** — localStorage, sessionStorage, and cookies captured at recording start (used by the player to restore auth state)
- **Browser metadata** — user agent, viewport, page title

Sensitive fields (passwords, emails, credit card inputs) are filtered automatically.

## Installation

This package is part of the workspace and is installed automatically via PNPM. To use it inside another workspace package:

```json
{
  "dependencies": {
    "@taka/recorder": "workspace:*"
  }
}
```

## Usage

```typescript
import { TakaRecorder } from '@taka/recorder';

const recorder = TakaRecorder.init({
  apiEndpoint: 'http://localhost:3001/api',
  uploadInterval: 5000,
  maxBatchSize: 50,
  enableNetworkCapture: true,
  enableStorageCapture: true,
  captureConsole: false,
});

// Optional — tag the session with a user identifier
recorder.identify('user-42');

// Pause/resume recording
recorder.pause();
recorder.resume();

// Stop and flush remaining buffer
recorder.stop();
```

The recorder skips initialization automatically when `window.__taka_replay` is set, so it does not record itself during a player replay.

## API

### `TakaRecorder.init(config)`

Initializes and auto-starts the recorder unless `autoStart: false` is passed.

### Instance methods

| Method | Description |
|--------|-------------|
| `start()` | Begin recording |
| `stop()` | Stop and flush remaining data |
| `pause()` | Pause event capture without tearing down |
| `resume()` | Resume after `pause()` |
| `identify(userId)` | Tag the session with a user ID |
| `getSessionId()` | Returns the current session ID |
| `isRecording()` | Returns whether recording is active |

## Architecture

| File | Responsibility |
|------|----------------|
| `recorder.ts` | Main `TakaRecorder` class — buffer, lifecycle, upload orchestration |
| `eventCapture.ts` | DOM event listeners + MutationObserver |
| `networkCapture.ts` | Patches `fetch` and `XMLHttpRequest` to record requests/responses |
| `storageCapture.ts` | Snapshots localStorage/sessionStorage/cookies and intercepts mutations |
| `uploader.ts` | Batched upload to the API endpoint |
| `browser.ts` | Browser-global entry point for `<script>` tag use |

## Build

```bash
pnpm build       # Compile TypeScript to dist/
pnpm type-check  # Type-check without emitting
```
