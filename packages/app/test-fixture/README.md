# @taka/test-fixture

A minimal, deterministic recording target plus a hermetic end-to-end test for the whole Taka pipeline. Replaces the old notes test-app as the automated-test fixture.

## What it is

- **`scenarios.mjs`** — the scenario registry. Each entry is one validation case (markup + behavior + optional regression variant) served at its own path. Adding coverage = adding a scenario here. See the [coverage checklist](#coverage-checklist) for what's covered and what's planned.
- **`server.mjs`** — a tiny Express server (port **3003**) that renders one page per scenario at `/<id>` (e.g. `/click`), an index at `/`, and serves the recorder's standalone IIFE bundle at `/recorder.js`.
- **A server-side "regression mode"** — `POST /__mode {"mode":"regression"}` flips an in-memory flag so a scenario applies its regression CSS (e.g. the click panel turns red). Same elements, same dimensions — only styling changes, producing a large, unambiguous pixel diff when the same recorded session is replayed.
- **`scripts/e2e.mjs`** — a self-contained orchestrator that spawns its own API + fixture + Chrome, records a scenario interaction, and asserts the full pipeline. It also starts a **second fixture on :3004** (a stand-in "preview" deployment) and runs a [cross-origin replay](#cross-origin-replay) check.

Each scenario lives on its own page so cases stay isolated and easy to manage — a flaky or in-progress scenario never blocks the others.

## Coverage checklist

Tracks which recorder events / use-cases have a fixture scenario wired through the e2e validation. Update this as scenarios land.

**Legend** — **Capture**: the recorder emits the event and it reaches the API · **Replay**: the player reproduces it during replay · **Regression**: a negative variant produces a failing diff · **n/a**: not applicable for this event.

> The player replays these event types: `click`, `input`, `scroll`, `navigation`, `submit`, `focus`, `resize`. `mutation` is captured as a side effect (not directly replayed); `mousemove` is captured but throttled and not replayed (intentionally out of scope).

| Done | Scenario | Path | Event(s) | Capture | Replay | Regression |
|:---:|----------|------|----------|:---:|:---:|:---:|
| ✅ | Click reveals text | `/click` | `click` | ✓ | ✓ | ✓ |
| ✅ | Text input | `/input` | `input` | ✓ | ✓ | ✓ |
| ⬜ | Form submit | `/submit` | `submit` | – | – | – |
| ⬜ | Focus / blur | `/focus` | `focus`, `blur` | – | – | n/a |
| ⬜ | Scroll | `/scroll` | `scroll` | – | – | – |
| ⬜ | Viewport resize | `/resize` | `resize` | – | – | n/a |
| ⬜ | SPA navigation | `/navigation` | `navigation` | – | – | – |
| ⬜ | Network capture + mock | `/network` | fetch / XHR | – | – | – |
| ⬜ | Storage snapshot / auth restore | `/storage` | storage | – | – | n/a |
| ⬜ | DOM mutation (observed) | via `/click` & others | `mutation` | – | n/a | n/a |
| ✅ | Cross-origin replay (preview) | record `/click` on :3003, replay on :3004 | `targetOrigin` | n/a | ✓ | ✓ |

## Usage

```bash
make e2e           # full hermetic test (build + record + replays + cross-origin + asserts), tears down
make e2e-headful   # same, with a visible browser (E2E_HEADFUL=1)
make e2e-keep      # run the flow, then leave API + both fixtures + dashboard up to explore
make fixture       # run the fixture standalone on :3003 for manual recording
```

- **`make e2e`** is the gate: exit code 0 means the whole pipeline is healthy. Run it after any change to the recorder, player, differ, storage, or API.
- **`make e2e-keep`** runs the identical flow but, instead of tearing down, also boots the dashboard and blocks — printing the URLs so you can poke around a project that already has the recorded session and all its test runs in it. Both fixtures stay up (primary on :3003, preview on :3004), so you can open the **Replay** dialog and enter `http://localhost:3004` to drive a cross-origin replay by hand. **Ctrl+C** is the teardown trigger; it stops every process and removes the temp data dir.
- **`make fixture`** runs just the page server for manual recording. Pass `TAKA_PROJECT_ID=<id>` to attribute recordings to a project (create it first via `POST /api/projects` or the dashboard).

## Why it's deterministic

Visual regression testing needs pixel-stable screenshots. The page is built to render identically every time:

- no clocks, timestamps, or random values shown,
- no animations/transitions (`* { transition: none !important }`),
- system font stack (no async web-font load),
- a fixed-size output panel (the regression is a pure background-color change — no reflow, identical dimensions),
- static text.

So two replays of the unchanged page are byte-identical (0% diff → pass), and only the regression flip causes a diff — and that diff (a large red panel) comfortably clears the 10% `VISUAL_DIFF_THRESHOLD`.

## Architecture

### Components and data flow

```
                        scripts/e2e.mjs  (orchestrator, hermetic)
                        ┌───────────────────────────────────────────────┐
        spawns ─────────┤  • temp DATA_ROOT                              │
   ┌────────────────────┤  • drives record + 3 replays                  │
   │        │           │  • asserts + tears down (process groups)       │
   │        │           └───────────────────────────────────────────────┘
   │        │
   ▼        ▼
┌──────┐  ┌──────────────────┐       record            ┌──────────────────────┐
│ API  │  │ fixture :3003    │◀─ Chrome drives the ─────│ puppeteer-core (host  │
│ :3001│  │  GET /  (index)  │   scenario interaction    │ Chrome), recorder on  │
│      │  │  GET /<scenario> │── recorder uploads ──────▶│ the page → POST       │
│      │  │  GET /recorder.js │   session to API          │ /projects/e2e/sessions│
│      │  │  POST /__mode     │                          └──────────────────────┘
│      │  └──────────────────┘
│      │
│      │   replay (TestService → @taka/player)
│      │   ┌───────────────────────────────────────────────┐
│      │──▶│ headless Chrome navigates to the fixture URL,   │
│      │   │ replays events, screenshots significant frames; │
│      │   │ @taka/differ pixel-diffs head vs baseline       │
│      │   └───────────────────────────────────────────────┘
└──────┘
   ▲
   │ (in keep mode) the web dashboard :3000 is also booted, proxying /api → :3001
```

### The recording path

The fixture page loads the recorder as a plain script: `<script src="/recorder.js">`. That file is `@taka/recorder`'s standalone **IIFE** bundle (`dist/browser.global.js`, built by rollup — see the [recorder README](../../lib/recorder/README.md)), which exposes `window.TakaRecorder`. An inline init runs only when `window.__taka_replay` is not set:

```html
<script src="/recorder.js"></script>
<script>
  if (!window.__taka_replay) {
    window.__takaRecorder = window.TakaRecorder.init({
      apiEndpoint: 'http://localhost:3001/api',
      projectId: 'e2e',        // injected server-side from TAKA_PROJECT_ID
      uploadInterval: 1500,
    });
  }
</script>
```

During recording the orchestrator drives host Chrome to the page, clicks the button, then calls `window.__takaRecorder.stop()` to force a synchronous flush, and polls the API until the session arrives with the expected `navigation` + `click` events.

### Why one recorded session, replayed three times

The crux of the regression test: the player (`@taka/player`) only mocks **recorded `fetch`/XHR** requests. The top-level HTML document is a browser navigation, never captured in `networkRequests`, so `page.goto()` re-fetches it **fresh from the fixture on every replay**. That lets a single recorded session be screenshotted against different server output:

| Step | Fixture mode | Outcome |
|------|--------------|---------|
| Replay 1 | stable | no baseline yet → screenshots stored as the **baseline** (`isBaseline: true`) |
| Replay 2 | stable | diff vs baseline → identical → **passed** |
| _toggle_ | → regression | `POST /__mode {"mode":"regression"}` |
| Replay 3 | regression | output panel is red → diff > threshold → **failed** |

The player sets `window.__taka_replay = true` via `evaluateOnNewDocument` before page scripts run, so the recorder stays dormant during replay while the page's own click handler still fires (producing the visible result that gets screenshotted).

### Cross-origin replay

After the scenario loop, the orchestrator validates the player's [`targetOrigin`](../../lib/player/README.md#replaying-against-a-different-origin) rebasing. A second fixture instance (same `server.mjs`) runs on **:3004** as a stand-in preview deployment. The harness reuses the click session — **recorded on :3003**, with its baseline captured there — and replays it against :3004:

| Step | Preview (:3004) mode | Expected |
|------|----------------------|----------|
| replay with `targetOrigin=http://localhost:3004` | stable | **passes** — rebased nav landed on :3004 and its render matches the :3003 baseline; the `TestResult` records `targetOrigin` |
| replay again | regression | **fails** — the preview's panel is red → diff clears the threshold |

If rebasing were broken the stable replay would error or mismatch, so a green run is strong evidence the feature works against real preview URLs.

### Process model & teardown

The orchestrator spawns the API, fixture (and, in keep mode, the dashboard) as child processes. Two things make teardown reliable:

- **Process groups** — each child is spawned `detached: true` (its own group), so killing the *group* (`process.kill(-pid, …)`) reaps the whole subtree: `pnpm → next start`, and the API → its Puppeteer Chrome. Killing just the direct child would orphan those grandchildren.
- **SIGTERM → grace → SIGKILL** — teardown signals SIGTERM first so the API runs its graceful shutdown (`sessionPlayer.destroy()` closes Chrome), waits ~1.5s, then SIGKILLs survivors. A guarded global SIGINT/SIGTERM handler runs the same teardown, so interrupting any run (including Ctrl+C in keep mode) cleans up — including removing the temp `DATA_ROOT`.

### Hermeticity

Each run uses a fresh `mkdtemp` `DATA_ROOT`, so runs don't pollute the repo `./data` or each other, and back-to-back runs are independent. The temp dir is removed on teardown.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Index — lists the available scenarios |
| `GET` | `/<id>` | A scenario page (e.g. `/click`); honors the current mode |
| `GET` | `/recorder.js` | The recorder IIFE bundle (`window.TakaRecorder`) |
| `POST` | `/__mode` | Body `{ "mode": "stable" \| "regression" }` — flip the in-memory render mode |
| `GET` | `/health` | `{ ok, mode, projectId, scenarios }` |

## Env

| Var | Default | Purpose |
|-----|---------|---------|
| `FIXTURE_PORT` | `3003` | Fixture server port |
| `TAKA_PROJECT_ID` | (unset) | Project the recorder attributes sessions to |
| `TAKA_API_ENDPOINT` | `http://localhost:3001/api` | API the recorder uploads to |
| `CHROME_PATH` | macOS Google Chrome | Chrome binary for the orchestrator's Puppeteer (e2e) |
| `E2E_HEADFUL` | (unset) | Set to `1` to launch a visible browser in the orchestrator |
| `E2E_KEEP` | (unset) | Set to `1` to leave servers up after the flow (Ctrl+C to tear down) |

## Extending it

The fixture starts with one scenario (`click`) on purpose — get the pipeline stable first, then grow coverage one scenario at a time. To add one:

1. **Add a scenario** to `scenarios.mjs`: `id` (its path), `body` (markup), `behavior` (the page's own JS — keep it deterministic: no time/random/animation), optionally `regressionCss` + `hasRegression: true` for a negative variant, and an `e2e` block (`record(page)` to drive it + `checks(events)` for capture assertions). It's served at `/<id>` and picked up by the e2e run automatically — the orchestrator iterates the registry.
2. **Run `make e2e`** — the new scenario goes through record → baseline → stable-pass → regression-fail with no orchestrator changes needed.
3. **Tick it off** in the [coverage checklist](#coverage-checklist) above.

> Tip: size any regression panel so the color flip clears the 10% diff threshold with margin (the existing scenarios use an ~800×400 panel ≈ 15–16% of the 1920×1080 screenshot).

Because the recorder/player/differ are exercised exactly as in production, a new scenario that records, replays, and diffs here is strong evidence it works for real apps too.
