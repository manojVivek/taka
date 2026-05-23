# @taka/player

Headless browser session replay engine built on Puppeteer. Re-runs recorded sessions deterministically, restores auth state, mocks network responses, and captures screenshots for visual diffing.

## Overview

The player takes a `SessionData` object produced by the recorder and replays it inside a real Chromium instance. It restores cookies and storage before navigation, intercepts network requests to return recorded responses, and replays each captured event in order. Screenshots are captured at significant events for downstream visual diffing.

## Features

- **Deterministic replay** — events fired in original order with timing controls
- **Auth state restoration** — cookies, localStorage, and sessionStorage restored before navigation; JWT `exp` claims patched to prevent client-side expiry redirects
- **Network mocking** — recorded HTTP responses returned via Puppeteer request interception, so the replay never depends on a live backend
- **Screenshot capture** — full page, viewport, or element screenshots saved to disk
- **Replay flag** — sets `window.__taka_replay = true` so the recorder skips initialization during replay

## Usage

```typescript
import { SessionPlayer } from '@taka/player';
import type { SessionData } from '@taka/types';

const player = new SessionPlayer({
  headless: true,
  viewport: { width: 1920, height: 1080 },
  timeout: 30000,
});

await player.initialize();

const result = await player.replay(sessionData, {
  screenshotOutputPath: './data/test-sessions/test-123/screenshots',
});

console.log(result);
// {
//   sessionId: 'session-abc123',
//   success: true,
//   screenshots: [ ... ],
//   duration: 4521,
// }

await player.destroy();
```

## API

### `new SessionPlayer(config?)`

| Option | Default | Description |
|--------|---------|-------------|
| `headless` | `true` | Run Chrome without a visible window |
| `viewport` | `1920x1080` | Page viewport size |
| `timeout` | `30000` | Per-action timeout in milliseconds |

### Instance methods

| Method | Description |
|--------|-------------|
| `initialize()` | Launch the browser |
| `replay(sessionData, options)` | Replay a session and return a `PlaybackResult` |
| `destroy()` | Close the browser |

## Chrome path

By default the player launches the system Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Override with the `CHROME_PATH` environment variable.

## Architecture

| File | Responsibility |
|------|----------------|
| `player.ts` | `SessionPlayer` class — browser lifecycle, replay loop, auth restoration, network mocking |
| `screenshot.ts` | `ScreenshotCapture` class — saves page/element/viewport screenshots to disk |
| `types.ts` | `PlayerConfig`, `PlaybackResult`, `ReplayOptions` |

## Build

```bash
pnpm build       # Compile TypeScript to dist/
pnpm type-check  # Type-check without emitting
```
