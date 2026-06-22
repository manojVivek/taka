# Taka — Recorder & Replay Architecture Proposals

**Date:** 2026-06-12
**Status:** Proposal
**Companion doc:** [`ARCHITECTURE_REVIEW.md`](ARCHITECTURE_REVIEW.md) (current-state flaws; referenced below as A-1…A-7, B-1…B-8)

This document proposes the next architectural step for Taka's capture → replay → baseline pipeline: the set of properties the recorder needs before it can be embedded in real apps, and a concrete implementation plan for each. The review doc describes what's wrong today; this one describes what to build.

---

## Guiding principles

### 1. Production-safety is a feature, not hardening

A recorder is code we ask other people to put on *their* site. Its prime directive is: **the host app must never be slower, broken, or blocked because of us.** Everything else is secondary. That implies a set of behaviors Taka currently has none of (fine for a POC — but it is *the* gap between a POC and an embeddable SDK):

- **Bounded startup cost.** The snippet loader must block app startup just long enough to install network hooks before the app's first request — with a hard budget (default **2000ms**). If the recorder bundle hasn't loaded by then, resolve with a **no-op recorder** and let the app proceed unrecorded. A slow CDN must never brick a customer page.
- **Env-aware payload thresholds with self-abandonment.** The recorder should monitor how much data it is generating and **automatically abandon the session if the load on the network is too large**, with stricter thresholds in production than in dev/staging. Abandonment is silent and safe: recording stops, the app is untouched.
- **`forceRecording` escape hatch.** Local/staging sessions legitimately produce huge payloads; an explicit opt-out from the abandonment heuristic keeps those recordable.
- **Error swallowing everywhere.** Every entry point catches, logs, and degrades to a no-op. `init()` never throws into host code (today `TakaRecorder` constructor throws on a missing `projectId` — `recorder.ts:20-25` — which is correct for the dev loop but must be caught by the public loader API).
- **Crash telemetry with release IDs.** Recorder errors should report to our own error tracker, stamped with the recorder build/release id, so we see breakage across customer sites without asking them. Must be **opt-out** (`disableErrorReporting`) for CSP-strict embedders.
- **Hard session cap.** Cap sessions at **`maxSessionTimeMs` = 10 minutes** by default. Unbounded sessions produce unbounded payloads and unreplayable tests; today Taka records forever and rewrites the whole session JSON on every batch (review D-2).

**Implementation sketch**

- New package `@taka/recorder-loader` (npm) exposing `tryLoadAndStartRecorder(config): Promise<{ stopRecording }>` — injects the versioned recorder bundle via `<script>`, supports `nonce` (CSP) and `integrity` + pinned `version` (supply chain), passes config via `window.__TAKA_*` globals, implements the 2s budget + no-op fallback, and checks the replay guard (see §6) before loading anything.
- In the recorder: a `PayloadGovernor` that tracks bytes buffered per interval; over threshold (env-dependent) → `abandon()` — stop all capture, drop buffers, emit one telemetry event.
- Config additions to `RecorderConfig`: `isProduction?: boolean`, `forceRecording?: boolean`, `maxSessionTimeMs?: number` (default 600_000), `disableErrorReporting?: boolean`.

### 2. Privacy must be layered and default-on

Taka's current model records input values in plaintext unless a deny-list heuristic on the field's name/type matches (`eventCapture.ts:327-340`). Deny-lists fail open: any sensitive field not named like one leaks. The correct posture is **mask by default, unmask by exception**, applied at multiple layers:

- **Layer 1 — capture-time masking at the DOM level.** All input values masked by default (`maskAllInputs: true`, with `maskInputOptions` granularity per input type). Masking happens *before* data enters the buffer, so unmasked values never exist in memory longer than the event handler.
- **Layer 2 — element-level escape hatches via CSS classes.** `taka-block` (don't record this subtree at all), `taka-ignore` (don't record events from it), `taka-mask` (record structure, mask text) — so app developers can annotate sensitive regions without config changes. (Adopting rrweb — §5 — gives us these as `blockClass`/`ignoreClass`/`maskTextClass` for free.)
- **Layer 3 — password redaction default-on.** `redactPasswords: true` by default, including scrubbing password-shaped values out of recorded *network request bodies*, not just input events.
- **Layer 4 — user-pluggable middleware.** A `RecorderMiddleware[]` config hook that transforms every payload **before upload** (redact response bodies, drop named headers, hash user ids). This is the only viable answer for production recording, where what counts as sensitive is app-specific. Replaces nothing — it composes with layers 1–3.

**Implementation sketch:** `middleware?: RecorderMiddleware[]` on `RecorderConfig`, applied in `SessionUploader.upload()`; strip `Authorization`/`Cookie`/`Set-Cookie` headers in `NetworkCapture` by default (config to re-enable); mask-by-default replaces `isSensitiveInput()`.

### 3. Recordings must be self-contained data

This is the deepest proposal, and it resolves the localhost/baseline problem (review A-7 follow-up discussion) at the root.

Today a Taka session stores *some* data (fetch/XHR bodies, a storage snapshot) but replay still re-renders against a **live app at the recorded origin by default** (`player.ts:107-112`). The recorded origin is doing two jobs — data provenance *and* default render target — and the second job breaks the moment the API server can't reach the origin (a dev's `localhost:3000`, a VPN-only staging box), poisoning baselines with error frames.

The fix is an invariant: **everything the session *consumed* lives inside the recording; the only live dependency at replay time is the app code under test.**

- **Network: capture everything, in HAR format.** Every request and response — method, URL, headers, full bodies, timings — stored as a standard HAR archive rather than our ad-hoc `NetworkRequest[]`. HAR is inspectable with existing tooling and replayable by any stubbing layer. Build on **Polly.JS** (fetch adapter + custom XHR interception + a custom in-memory persister) instead of hand-rolled monkey-patching; it already handles the edge cases our `networkCapture.ts` misses (review A-4 lists several).
- **WebSocket frames** are part of the data dependency surface: record per-socket id + URL + ordered sent/received messages with timestamps, including binary frame serialization.
- **Client state: storage *and* IndexedDB.** Snapshot localStorage, sessionStorage, cookies (already done) **and IndexedDB** — many real apps keep auth/session state there, and replays of those apps are impossible without it.
- **DOM: snapshot it.** Record a full serialized DOM snapshot plus incremental mutations (§5). Then the recording itself is a render-truth artifact — useful for masking, session viewing, and as a future fallback baseline source that requires no live app at all.
- **Replay target becomes explicit.** With data self-contained, the replay/baseline target is *never* derived from the session URL. It is a **CI-built artifact or preview deployment URL supplied at replay time** (Taka already has `targetOrigin` plumbing — make it required when the recorded origin is loopback/private, per review follow-up recommendation #2). A session recorded on `localhost:3000` replays anywhere, because nothing needs to reach `localhost:3000`: the HAR feeds the network layer, the app code comes from the target.

#### 3a. What a recording can — and cannot — contain

In-page capture has a hard boundary that shapes the whole design, so it's worth stating explicitly:

- **A recorder is JavaScript running inside the page.** It can intercept the programmatic network APIs — `fetch`, `XMLHttpRequest`, `WebSocket` — but it **cannot see the document request itself**, nor `<script>`/`<link>`/`<img>` subresource loads: the document loads before any page JS exists, and asset loads don't transit the APIs page code can hook. The HAR therefore carries the **dynamic data layer** — everything the backend would have served — never the page's own code. "Capture everything" in §3 means everything *capturable*, and that is exactly the data layer.
- **It cannot capture pixels.** No DOM API exposes the rendered output of a page (screen-capture APIs require user permission prompts; canvas-based re-rendering is an approximation). The recorder uploads only structured JSON. Screenshots are **manufactured server-side at replay time** by the orchestrated browser — which is also what makes pixel comparison meaningful: baseline and head frames are rendered by the same browser build, viewport, and fonts, never by a heterogeneous end-user device.
- **What it *can* capture about the page is the parsed, live DOM**: a full serialized snapshot plus incremental mutations, with stylesheet rules inlined from `document.styleSheets` and optionally inlined images. Be precise about what this artifact is: the DOM *as it stood at snapshot time* — after parsing, after whatever JS already ran — a render-equivalent visual record, **not the original HTML file**. Replaying a snapshot reconstructs appearance; it does not execute application scripts, so it can show what the user saw but cannot boot the app.

#### 3b. The replay execution model — where the page comes from

A test run re-executes real application code, so the base HTML/JS/CSS must come from a live build — and that is desirable, not a limitation: the entire point of a regression run is to exercise the **new** build's markup, scripts, and styles. The recording deliberately does not contain the page. The division of labor:

```
recording   →  HAR (fetch/XHR/WS bodies)   = simulates the backend
recording   →  DOM snapshot                = visual record of what the user saw
build / CI  →  HTML + JS + CSS             = the frontend code under test
```

Under this model **no backend needs to exist during tests**: the backend's output is canned in the HAR, and the frontend's assets were never the backend's job — they come from the build artifact, which CI has by construction.

That leaves one operational question: how does the replaying browser reach the app under test — in particular for sessions recorded on a developer's `localhost`, which a remote server can never dial? (Recording there is always fine: capture uploads *outbound* from the browser to the API; only replay has a reachability constraint.) Four patterns, in order of preference:

1. **Co-locate the replayer with the app — the CI-runner pattern.** Replay executes inside the CI job (or a local agent; the natural role of `@taka/worker`): CI builds the new frontend, starts it on the runner's *own* `localhost`, replays against it, and uploads screenshots/results to the central API. Loopback URLs are fine whenever replayer and app share a machine — localhost was never the problem; the replayer and the app being on *different* machines was.
2. **Explicit reachable target (`targetOrigin`).** Replay against a preview/staging deployment of the same code. Already supported by the rebasing layer; should be *required*, not optional, when the recorded origin is loopback/private.
3. **Snapshot rendering — for baselines and viewing only.** With DOM snapshots in the recording, the server can render *what was recorded* with zero reachability to anything. Valid as a visual record and a future baseline source; not valid for testing new code (no scripts execute, per §3a).
4. **Tunnels — rejected as architecture.** Exposing the dev machine via a tunnel works mechanically but is fragile glue (tunnel lifetime, auth, HTTPS); acceptable as a one-off dev convenience, never the designed path.

### 4. Sessions must carry an app version (`commitHash`)

A recording is only meaningful relative to the code that produced it. Add `commitHash` (or `appVersion`) to `RecorderConfig`, stamp it into `SessionData.metadata`, and surface it through the API/UI.

This is the foundation for sane baseline semantics: a baseline becomes **"this session, rendered at commit X, against deployment Y"** — an explicit, reproducible coordinate — instead of today's **"whatever the first replay happened to hit"** (`testService.ts:191-202`, review A-7/B-baseline issues). Concretely:

- `TestResult` already stores `sourceOrigin`/`targetOrigin`; add `commitHash` from the session and `targetCommitHash` supplied by the replay caller (CI knows it).
- Baseline promotion records the (commit, origin) pair it was rendered against; the UI shows it; head runs against a different pair warn instead of silently diffing.
- Re-baselining (roadmap #1) becomes "promote run R (commit X→Y) to baseline," which is auditable.

### 5. Capture layer: adopt rrweb + the full fidelity long tail

Reimplementing capture from scratch is the wrong altitude — Taka's ~1,000-line recorder covers a small fragment of what real apps need, and the long tail is where session replay lives or dies. Adopt **rrweb** as the DOM capture engine and keep Taka's value in the replay/diff/baseline layer. The target capability set:

- **DOM recording:** `takeFullSnapshot()` on start + incremental mutation stream (replaces our selector-string `MutationObserver` events, which nothing consumes today — review D-1). Includes input masking (§2) at serialization time.
- **Hard-DOM coverage** (all rrweb-supported, mostly config): canvas recording, shadow DOM, `adoptedStyleSheets`, custom elements, **cross-origin iframes**, web workers, font collection, inlined/linked stylesheet snapshotting (`snapshotLinkedStylesheets` option — rules read from `document.styleSheets` and inlined, with a network re-fetch only for CORS-blocked sheets, so the snapshot renders standalone), optional inlined images.
- **Interaction events** (click/input/scroll/etc.) come from rrweb's incremental events keyed to snapshot node ids — eliminating our fragile CSS-selector targeting (`getElementSelector`, review A-5) as the primary addressing scheme. Selector generation remains only as a derived artifact for the replay-by-reexecution path.
- **State capture:** localStorage, sessionStorage, cookies, IndexedDB (§3).
- **Network capture:** Polly.JS-based HAR recording + WebSocket interception (§3), framed per-iframe (`frameId`) so multi-frame apps reconstruct correctly.

**Upload pipeline** (replaces `uploader.ts` + the merge-chain pressure in review D-2):

- **Batched uploads on an env-aware interval:** every **5s in non-production, 10s in production** (config: `uploadIntervalMs`). Batches are *incremental segments* (events since last upload), not full-session re-sends — the server appends segments instead of merge-rewriting the whole JSON.
- **Unload flush via `fetch(…, { keepalive: true })`**, with `pagehide`/`beforeunload` triggers — **not `sendBeacon`**, whose ~64KB body limit silently drops the tail of real sessions (review D-3). Keepalive fetch has no such cap and reports errors.
- **Session cap:** stop cleanly at `maxSessionTimeMs` (default 10 min, §1): final flush, mark session complete.

### 6. Environment-gated adoption path

Make the recommended integration explicitly environment-aware, and make the recorder behave differently per environment:

- **Dev/preview first.** The documented default integration gates recording on the host app's own environment check (e.g. `if (isDevModeOrPreview()) await tryLoadAndStartRecorder(...)`). Dev/preview traffic is developer-shaped, data is harmless, and payloads can be large (`forceRecording: true` appropriate here). This is the right adoption path for Taka's current maturity — and it pairs with §3/§4: record locally, baseline against a canonical CI-built deployment.
- **Production recording is supported but armored:**
  - **Two-stage loading with an early interceptor.** A tiny `network-interceptor` bundle installs fetch/XHR/WebSocket hooks immediately and **buffers in memory only** — no uploads, no unload handlers. The main recorder, loaded later (or never), drains the buffer via `getAndClearBufferedData()`; `dispose()` drops everything. This solves per-user sampling cleanly: you often can't decide whether to record until user data loads, but by then the interesting early requests already happened. Buffer first, decide later, never upload undecided data.
  - **Payload abandonment** (§1) and **middleware redaction** (§2) on by default; `isProduction: true` selects the stricter thresholds and the 10s upload interval.
- **Replay guard in the SDK, not the integration.** The loader's first check must be the replay flag (`window.__taka_replay`) — return a no-op recorder during replays. Today this guard exists only in the test fixture and is falsely documented as automatic (review A-6); under §6 it becomes a loader-level guarantee plus a recorder-level belt-and-suspenders check in `TakaRecorder.init()`.

---

## Phasing

| Phase | Scope | Builds on |
|-------|-------|-----------|
| 1 | Replay guard in SDK; mask-by-default inputs; strip auth headers; `commitHash` in config/metadata; keepalive-fetch unload flush; `maxSessionTimeMs` cap | Current recorder, small diffs |
| 2 | `@taka/recorder-loader` (2s budget, no-op fallback, SRI/nonce, version pinning); error swallowing + opt-out telemetry; env-aware upload intervals | Phase 1 |
| 3 | HAR-format network store on Polly.JS; WebSocket + IndexedDB capture; incremental upload segments (server appends) | Phase 2 |
| 4 | rrweb DOM snapshots + hard-DOM long tail; node-id event addressing; explicit replay-target requirement for loopback origins; baseline = (commit, origin) coordinate; CI-runner replay execution co-located with the app (`@taka/worker`) | Phase 3 |
| 5 | Early-interceptor bundle + production sampling; payload governor with self-abandonment; middleware API | Phase 4 |

Each phase leaves the e2e suite green: the fixture scenarios keep validating record → baseline → pass → regression-fail while the capture substrate is swapped underneath.
