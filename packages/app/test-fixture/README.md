# @taka/test-fixture

A minimal, deterministic recording target plus a hermetic end-to-end test for the whole Taka pipeline. Replaces the old notes test-app as the automated-test fixture.

## What it is

- **`scenarios.mjs`** — the scenario registry. Each entry is one validation case (markup + behavior + optional regression variant) served at its own path. Adding coverage = adding a scenario here. See the [coverage checklist](#coverage-checklist) for what's covered and what's planned.
- **`server.mjs`** — a tiny Express server that renders one page per scenario at `/<id>` (e.g. `/click`), an index at `/`, and serves the recorder's standalone IIFE bundle at `/recorder.js`. Its render mode is **fixed at startup** via the `FIXTURE_MODE` env var (`stable` | `regression`).
- **Fixed-mode origins (no runtime flag)** — run one instance in `stable` mode and one in `regression` mode on different ports. The regression instance bakes in each scenario's `regressionCss` (e.g. the panel turns red — same elements/dimensions, only styling changes). Replaying a recorded session against a stable origin **passes** (matches its baseline); against the regression origin it **fails** (a large, unambiguous diff). No shared mutable state means scenarios run in parallel, and you validate by origin: point replays at the stable origin → all pass, at the regression origin → all fail.
- **`scripts/e2e.mjs`** — a self-contained orchestrator that spawns its own API + **three fixed-mode fixtures** (stable, preview, regression) + Chrome, records each scenario on the stable origin, then replays it **cross-domain** against the preview origin (expect pass) and the regression origin (expect fail) — all scenarios in parallel.

Each scenario lives on its own page so cases stay isolated and easy to manage — a flaky or in-progress scenario never blocks the others.

## Coverage checklist

Tracks which recorder events / use-cases have a fixture scenario wired through the e2e validation. Update this as scenarios land.

**Legend** — **Capture**: the recorder emits the event and it reaches the API · **Replay**: the player reproduces it during replay · **Regression**: a negative variant produces a failing diff · **n/a**: not applicable for this event.

> The player replays these event types: `click`, `input`, `scroll`, `navigation`, `submit`, `focus`, `resize`. `mutation` is captured as a side effect (not directly replayed); `mousemove` is captured but throttled and not replayed (intentionally out of scope).

| Done | Scenario | Path | Event(s) | Capture | Replay | Regression |
|:---:|----------|------|----------|:---:|:---:|:---:|
| ✅ | Click reveals text | `/click` | `click` | ✓ | ✓ | ✓ |
| ✅ | Text input | `/input` | `input` | ✓ | ✓ | ✓ |
| ✅ | Form submit | `/submit` | `submit` | ✓ | ✓ | ✓ |
| ✅ | Focus / blur | `/focus` | `focus`, `blur` | ✓ | ✓ | ✓ |
| ✅ | Scroll | `/scroll` | `scroll` | ✓ | ✓ | ✓ |
| ⬜ | SPA navigation | `/navigation` | `navigation` | – | – | – |
| ⬜ | Network capture + mock | `/network` | fetch / XHR | – | – | – |
| ⬜ | Storage snapshot / auth restore | `/storage` | storage | – | – | n/a |
| ✅ | Cross-origin replay (preview) | every scenario: record on stable, replay on preview + regression | `targetOrigin` | n/a | ✓ | ✓ |

## Usage

```bash
make e2e           # full hermetic test (build + record + cross-domain pass/fail replays), tears down
make e2e-headful   # same, with a visible browser (E2E_HEADFUL=1)
make e2e-keep      # run the flow, then leave API + the 3 fixtures + dashboard up to explore
make fixture       # run a stable fixture standalone on :9002 for manual recording
```

- **`make e2e`** is the gate: exit code 0 means the whole pipeline is healthy. Run it after any change to the recorder, player, differ, storage, or API. It runs all scenarios **in parallel** against three fixed-mode origins (stable `:9002`, preview `:9003`, regression `:9004`).
- **`make e2e-keep`** runs the identical flow but, instead of tearing down, boots the dashboard and blocks — printing the URLs so you can poke around a project pre-loaded with the recorded sessions + test runs. The three fixtures stay up: **record your own** sessions on the stable origin (`http://localhost:9002/click` or `/input`), then **Replay** from the dashboard targeting the **preview** (`:9003` → passes) or **regression** (`:9004` → fails) origin in the Replay dialog. **Ctrl+C** tears everything down and removes the temp data dir.
- **`make fixture`** runs just the page server (stable mode) for manual recording. Pass `TAKA_PROJECT_ID=<id>` to attribute recordings to a project (create it first via `POST /api/projects` or the dashboard), or `FIXTURE_MODE=regression` to serve the regression variant.

## Why it's deterministic

Visual regression testing needs pixel-stable screenshots. The page is built to render identically every time:

- no clocks, timestamps, or random values shown,
- no animations/transitions (`* { transition: none !important }`),
- system font stack (no async web-font load),
- a fixed-size output panel (the regression is a pure background-color change — no reflow, identical dimensions),
- static text.

So replaying against the stable and preview origins is byte-identical to the baseline (0% diff → pass), and only the regression origin's styling causes a diff — and that diff (a large red panel) comfortably clears the 10% `VISUAL_DIFF_THRESHOLD`.

## Architecture

### Components and data flow

```
                        scripts/e2e.mjs  (orchestrator, hermetic)
                        ┌───────────────────────────────────────────────┐
        spawns ─────────┤  • temp DATA_ROOT                              │
   ┌────────────────────┤  • record on stable, replay vs preview + regr │
   │        │           │  • all scenarios in parallel; tears down        │
   │        │           └───────────────────────────────────────────────┘
   │        │
   ▼        ▼
┌──────┐  ┌─────────────────────────────────────┐   record   ┌──────────────────────┐
│ API  │  │ stable     :9002  (FIXTURE_MODE=     │◀─ Chrome ──│ puppeteer-core (host  │
│ :9001│  │             stable) — record source  │  drives    │ Chrome), recorder on  │
│      │  │ preview    :9003  (stable)  ── pass   │  scenario  │ the page → POST       │
│      │  │ regression :9004  (regression)─ fail  │            │ /projects/e2e/sessions│
│      │  │  GET /  ·  GET /<scenario>  ·  /recorder.js  └──────────────────────┘
│      │  └─────────────────────────────────────┘
│      │
│      │   replay (TestService → @taka/player), per scenario:
│      │   ┌──────────────────────────────────────────────────────┐
│      │──▶│ goto stable (baseline), then rebase onto preview      │
│      │   │ (targetOrigin → pass) and regression (→ fail);         │
│      │   │ viewport screenshots; @taka/differ diffs vs baseline   │
│      │   └──────────────────────────────────────────────────────┘
└──────┘
   ▲
   │ (in keep mode) the web dashboard :9000 is also booted, proxying /api → :9001
```

### The recording path

The fixture page loads the recorder as a plain script: `<script src="/recorder.js">`. That file is `@taka/recorder`'s standalone **IIFE** bundle (`dist/browser.global.js`, built by rollup — see the [recorder README](../../lib/recorder/README.md)), which exposes `window.TakaRecorder`. An inline init runs only when `window.__taka_replay` is not set:

```html
<script src="/recorder.js"></script>
<script>
  if (!window.__taka_replay) {
    window.__takaRecorder = window.TakaRecorder.init({
      apiEndpoint: 'http://localhost:9001/api',
      projectId: 'e2e',        // injected server-side from TAKA_PROJECT_ID
      uploadInterval: 1500,
    });
  }
</script>
```

During recording the orchestrator drives host Chrome to the page, clicks the button, then calls `window.__takaRecorder.stop()` to force a synchronous flush, and polls the API until the session arrives with the expected `navigation` + `click` events.

### One recorded session, replayed cross-domain against three origins

The crux: the player (`@taka/player`) only mocks **recorded `fetch`/XHR** requests. The top-level HTML document is a browser navigation, never captured in `networkRequests`, so `page.goto()` re-fetches it **fresh from whichever origin the replay is pointed at**. Combined with the player's [`targetOrigin`](../../lib/player/README.md#replaying-against-a-different-origin) rebasing, a single session recorded on the stable origin is screenshotted against three same-code origins running in fixed modes:

| Replay | Target origin | Outcome |
|--------|---------------|---------|
| baseline | stable `:9002` (recorded origin) | no baseline yet → screenshots stored as the **baseline** (`isBaseline: true`) |
| preview | preview `:9003` (`targetOrigin`, stable) | rebased nav lands on :9003, renders identically → diff ≈ 0 → **passes** (a good preview) |
| regression | regression `:9004` (`targetOrigin`) | panel is red → diff > threshold → **fails** (a regressed preview); `TestResult` records `targetOrigin` |

This validates **both** directions of cross-origin replay at once — a matching preview passes (no false diff from rebasing), a changed one fails — for every scenario, so there's no separate cross-origin step. If rebasing were broken, the preview replay would mismatch (false fail) or the regression replay wouldn't reach :9004 (false pass).

Because the three origins hold no shared mutable state, scenarios run **in parallel**. The player sets `window.__taka_replay = true` via `evaluateOnNewDocument` before page scripts run, so the recorder stays dormant during replay while the page's own handler still fires (producing the visible result that gets screenshotted).

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
| `GET` | `/<id>` | A scenario page (e.g. `/click`), rendered in this instance's fixed mode |
| `GET` | `/recorder.js` | The recorder IIFE bundle (`window.TakaRecorder`) |
| `GET` | `/health` | `{ ok, mode, projectId, scenarios }` (mode is fixed at startup) |

## Env

| Var | Default | Purpose |
|-----|---------|---------|
| `FIXTURE_PORT` | `9002` | Fixture server port |
| `FIXTURE_MODE` | `stable` | Render mode for this instance: `stable` or `regression` (fixed at startup) |
| `TAKA_PROJECT_ID` | (unset) | Project the recorder attributes sessions to |
| `TAKA_API_ENDPOINT` | `http://localhost:9001/api` | API the recorder uploads to |
| `CHROME_PATH` | macOS Google Chrome | Chrome binary for the orchestrator's Puppeteer (e2e) |
| `E2E_HEADFUL` | (unset) | Set to `1` to launch a visible browser in the orchestrator |
| `E2E_KEEP` | (unset) | Set to `1` to leave servers up after the flow (Ctrl+C to tear down) |
| `E2E_{API,STABLE,PREVIEW,REGRESSION,WEB}_PORT` | `9001`/`9002`/`9003`/`9004`/`9000` | Override e2e ports — e.g. run on a 91xx range alongside a `make e2e-keep` session holding the defaults |

## Extending it

The fixture starts with one scenario (`click`) on purpose — get the pipeline stable first, then grow coverage one scenario at a time. To add one:

1. **Add a scenario** to `scenarios.mjs`: `id` (its path), `body` (markup), `behavior` (the page's own JS — keep it deterministic: no time/random/animation), optionally `regressionCss` + `hasRegression: true` for a negative variant, and an `e2e` block (`record(page)` to drive it + `checks(events)` for capture assertions). It's served at `/<id>` and picked up by the e2e run automatically — the orchestrator iterates the registry.
2. **Run `make e2e`** — the new scenario goes through record (stable) → baseline → preview-pass → regression-fail with no orchestrator changes needed.
3. **Tick it off** in the [coverage checklist](#coverage-checklist) above.

> Tip: the player screenshots the **viewport** (1920×1080), reflecting the current scroll position — not the full page. Size any regression panel so it's a comfortable fraction of the viewport (the scenarios use an ~800–1000px-wide panel ≈ 15–29%) and make sure it's actually on screen in the frame it should affect. For a scroll scenario, put the regression target **below the fold** so it only enters the viewport — and only produces a diff — once the scroll has been replayed.

Because the recorder/player/differ are exercised exactly as in production, a new scenario that records, replays, and diffs here is strong evidence it works for real apps too.
