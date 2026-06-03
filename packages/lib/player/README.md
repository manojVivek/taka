# @taka/player

Headless browser session replay engine built on Puppeteer. Re-runs recorded sessions deterministically, restores auth state, mocks network responses, and emits screenshots as `Buffer`s for the caller to persist.

## Overview

The player takes a `SessionData` object produced by the recorder and replays it inside a real Chromium instance. It restores cookies and storage before navigation, intercepts network requests to return recorded responses, and replays each captured event in order. As it goes, it hands the caller a PNG `Buffer` for each significant event via an `onScreenshot` callback — the player itself does no filesystem I/O, so persistence is free to live anywhere (local disk, S3, memory, /dev/null for debug).

## Features

- **Deterministic replay** — events fired in original order with timing controls
- **Auth state restoration** — cookies, localStorage, and sessionStorage restored before navigation; JWT `exp` claims patched to prevent client-side expiry redirects
- **Network mocking** — recorded HTTP responses returned via Puppeteer request interception, so the replay never depends on a live backend
- **Cross-origin replay** — a recorded session can be replayed against an arbitrary `targetOrigin` (a Vercel-style preview, staging, or local dev) without rewriting the stored session; see [Replaying against a different origin](#replaying-against-a-different-origin)
- **Screenshot capture** — full page, viewport, or element PNGs emitted as `Buffer`s via callback
- **Replay flag** — sets `window.__taka_replay = true` so the recorder skips initialization during replay
- **No filesystem dependency** — the player is pure; storage is the caller's concern

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
  // Optional: replay against a preview deployment instead of the recorded origin.
  // Omit (or set equal to the recorded origin) for a normal same-origin replay.
  targetOrigin: 'https://preview-xyz.vercel.app',
  onScreenshot: async (meta, bytes) => {
    // meta: { filename, eventIndex, eventType, timestamp }
    // bytes: Buffer (PNG)
    await myStorage.put(meta.filename, bytes);
  },
});

console.log(result);
// {
//   sessionId: 'session-abc123',
//   success: true,
//   screenshots: [ /* ScreenshotMeta[] — refs only, no bytes */ ],
//   duration: 4521,
// }

await player.destroy();
```

The `onScreenshot` callback fires for the initial page state, after each visually-significant event (click, submit, navigation, input), and once at the end. If omitted, the player still captures screenshots and returns their metadata, but nothing is persisted.

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

### `ReplayOptions`

| Field | Type | Description |
|-------|------|-------------|
| `onScreenshot` | `(meta: ScreenshotMeta, bytes: Buffer) => Promise<void>` | Optional. Invoked once per captured screenshot. The caller persists, uploads, or discards as desired. |
| `targetOrigin` | `string` | Optional. Replay against this origin (e.g. `https://preview.example.com`) instead of the one the session was recorded on. Same-origin URLs are rebased onto it; cross-origin URLs are left as recorded. Absent or equal to the recorded origin → no rebasing. |

### `ScreenshotMeta`

| Field | Type | Description |
|-------|------|-------------|
| `filename` | `string` | Deterministic name, e.g. `0003_click_1716501234567.png` |
| `eventIndex` | `number` | 0 = initial, `N+1` for the screenshot after event N, `events.length` = final |
| `eventType` | `string` | `initial`, the event type, or `final` |
| `timestamp` | `number` | Capture time in ms |

## Replaying against a different origin

Sessions are stored **exactly as recorded** (URLs are absolute), so the recording origin is always recoverable as `new URL(sessionData.url).origin`. Passing a `targetOrigin` to `replay()` makes the session **portable to any deployment** without rewriting stored data — the original recording is the *source* origin, derived per-session, so a project that mixes recording origins (local dev, staging, QA) rebases each session from the right place automatically.

Given a `targetOrigin`, the player rebases **same-origin** URLs (those whose origin equals the source) onto the target and leaves **cross-origin** URLs (CDNs, third-party APIs, a separate API origin) as recorded. The helper is `rebaseUrl(url, sourceOrigin, targetOrigin)` (exported), applied at four sites:

| Site | What gets rebased |
|------|-------------------|
| initial navigation | `page.goto(sessionData.url)` → the target |
| network mock map | mock keys (`METHOD:url`) so a same-origin fetch/XHR on the target matches its recorded response |
| navigation events | replayed `navigation` event URLs |
| auth cookies | restored-cookie **domain** → the target's hostname |

Why same-origin-only is correct even for API calls: the player **mocks** recorded fetch/XHR (it never hits them live), so the app's own JS/CSS/images — which aren't mocked — load **live from the target**, which is exactly the preview you want to test. Same-origin API calls still get their recorded responses because the mock-map keys are rebased; a separate API origin matches its recorded absolute URL without rebasing.

> **Known limitation:** cookies are re-scoped to the target hostname (domain + path) but their `secure`/`sameSite` attributes are not re-derived. Auth-gated HTTPS previews that require `Secure`/`SameSite=None` cookies may not authenticate correctly yet.
>
> **Future:** multi-origin apps (several app origins that must each map to a corresponding preview) are a clean extension via an origin *map* (`{sourceA: targetA, …}`) over the same `rebaseUrl` mechanism; v1 supports a single target.

## Chrome path

By default the player launches the system Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Override with the `CHROME_PATH` environment variable.

## Architecture

| File | Responsibility |
|------|----------------|
| `player.ts` | `SessionPlayer` class — browser lifecycle, replay loop, auth restoration, network mocking |
| `rebase.ts` | `rebaseUrl` / `rebaseHostname` — swap same-origin URLs onto a `targetOrigin` for cross-origin replay |
| `screenshot.ts` | `ScreenshotCapture` class — invokes `page.screenshot()` and returns `{ meta, bytes }` |
| `types.ts` | `PlayerConfig`, `PlaybackResult`, `ReplayOptions`, `ScreenshotMeta`, `ScreenshotSink` |

## Build

```bash
pnpm build       # Compile TypeScript to dist/
pnpm type-check  # Type-check without emitting
```
