# Taka — Architecture & Code Review

**Date:** 2026-06-12
**Scope:** Full repository read — every package (`shared/*`, `lib/*`, `app/*`), the e2e harness, fixtures, configs, and docs.

## Verdict

The skeleton is sound and the happy path genuinely works — `make e2e` proves record → baseline → pass → regression-fail hermetically, and the storage/rebase/merge layers are well-engineered. But the product thesis is "record **real** user sessions, replay them as tests," and several load-bearing pieces only work on the engineered-deterministic fixture, not on real apps. There are also a few outright bugs and one doc/code contradiction that would bite the first real integration.

Honest status: **architecture validated, product-critical fidelity layer not yet started.** The threshold default plus the missing re-baseline flow mean the tool would not yet deliver value on a real app even within its current fidelity limits.

---

## A. Architecture-level concerns

These decide whether the product works on real apps, ordered by how much they threaten the thesis.

### A-1. The default diff threshold makes the tool blind to the regressions it exists to catch

`VISUAL_DIFF_THRESHOLD = 0.1` (`packages/shared/constants/src/index.ts:26`) means 10% of the viewport's pixels must change before a frame fails. At 1920×1080 that is ~207,000 pixels — a 455×455 solid block. A missing button, broken icon, wrong color, or shifted layout is typically <1% and **passes silently**.

The codebase itself admits this: every fixture scenario carries the comment *"Large fixed-size panel so the regression color flip clears the diff threshold"* and ships 800×400 red panels to make the e2e detectable. Real visual-testing tools default to ~0.01–0.1% or gate on absolute pixel count. As shipped, Taka reports "all passed" on almost any real regression — the single most consequential flaw in the repo.

### A-2. No determinism control inside the replayed page

The player injects nothing to stabilize rendering — no `* { animation: none; transition: none }`, no `Date`/`Math.random` freezing, no caret/focus-ring suppression, no font-load wait. All of that determinism is hand-built into the *fixture's* CSS instead (`caret-color: transparent`, `transition: none !important`, the "no clocks, randomness, animations" rule in `scenarios.mjs`).

That is backwards: the fixture proves the pipeline works only on pages pre-engineered to be deterministic. Any real app with a clock, an animation, a spinner, or a focused input will produce flaky diffs — and since baseline and head are both replays, flakiness shows up as false regressions. Tools in this space (Meticulous, Chromatic) live or die on virtualizing time/randomness/network; this is the gap between POC and product.

### A-3. Replay timing is fixed-delay, not condition-based

`replayEvent` is `sleep(50)` → action → `sleep(100)` (`packages/lib/player/src/player.ts:216-252`). There is no waiting for network idle, rAF settling, or DOM stability after a click. The fixture's handlers are synchronous so 100ms is enough; any real app doing async work after a click will sometimes have rendered when the screenshot fires and sometimes not. Classic flaky-test trap — and it corrupts baselines too (see B-4).

### A-4. Recorded data only partially pins the replay

Network mocking covers fetch/XHR with exact `method:URL` matching (`player.ts:168-204`). That leaves:

- **Server-rendered HTML unmocked** — for SSR apps (Next.js, Rails, …) the initial DOM is fetched live from the target with *live data*, so content changes diff against the baseline. The approach is really only sound for fully client-rendered apps whose data arrives via fetch/XHR.
- **Exact-URL matching breaks on cache-busters/timestamps in query strings** — the replayed app generates a fresh `?_=...`, misses the mock, and hits the live backend.
- **Repeated GETs to the same URL** all serve the *last* recorded response (the `Map` overwrites earlier ones), so polling sequences replay wrong.
- **Recorded response headers are replayed verbatim** — including `content-encoding: gzip` and the original `content-length` — while the body is the *decoded* text. Chrome will fail to decode such responses. Dev servers rarely gzip, so e2e passes; production APIs almost always do.

### A-5. Selector capture is fragile and has a correctness bug

`getElementSelector` (`packages/lib/recorder/src/eventCapture.ts:288-325`):

- It computes the index among **same-tag** siblings but emits `:nth-child(n)` (`eventCapture.ts:313-318`). Those are different semantics: for `<h1/><p>a</p><p>b</p>`, clicking the second `<p>` records `p:nth-child(2)` — which resolves to the *first* `<p>`. Replay silently clicks the wrong element. Should be `:nth-of-type`.
- It embeds the first two CSS classes. With CSS Modules/styled-components/Emotion, class names are build-hashed — every deploy invalidates every recorded selector, defeating "replay against a preview build." Click events fall back to recorded coordinates, but those were captured at the *user's* viewport while replay runs at a hard-coded 1920×1080 (`player.ts:15`), so on responsive layouts the fallback clicks the wrong place. Inputs have no fallback at all.

### A-6. The recorder records its own replays — and the docs claim otherwise

The player sets `window.__taka_replay` (`player.ts:99-101`), and the recorder README states *"The recorder skips initialization automatically when `window.__taka_replay` is set"* — but there is **no such check anywhere in the recorder source**; only the fixture's inline script guards it (`packages/app/test-fixture/server.mjs:81`). The getting-started page's copy-paste snippet (`packages/app/web/src/app/projects/[projectId]/getting-started/page.tsx:37-48`) has no guard either.

So the first real app that embeds the official snippet will, on every test run, record the replay as a *new session* and upload it mid-replay — polluting the session list with one garbage session per test, forever. One `if (window.__taka_replay) return` in `TakaRecorder.init` fixes it; right now code and docs contradict each other.

### A-7. The baseline lifecycle is missing its second half

First replay auto-promotes to baseline (`packages/app/api/src/services/testService.ts:191-202`); after that there is no way to accept an intentional UI change — the "approve as new baseline" / "reject" buttons are disabled stubs ("endpoint not yet implemented", `tests/[id]/page.tsx:142-149, 351-363`), and no API exists. The only workaround is deleting the session (losing the recording) or hand-deleting `screenshots/` on disk. The roadmap acknowledges this as item #1, but the implication should be stated plainly: **the tool stops being usable at the first intentional UI change.**

Worse, baselines are created even when the replay itself errored (`executeTest` doesn't check `playbackResult.success` before promoting), so a half-broken first run becomes the permanent reference and every subsequent good run "fails."

---

## B. Concrete bugs (high confidence)

1. **Path traversal in the blob endpoints.** `GET .../screenshots/:filename` passes the param straight into `path.join` (`packages/app/api/src/index.ts:74-117` → `packages/lib/storage/src/fileStorage.ts:355-362`). Express decodes `%2F`, so `..%2F..%2Fsession.json` escapes the screenshots dir and can read arbitrary files (served as `image/png`, no extension check, no auth). Local-only today, but a real vulnerability the moment this binds to anything but localhost.
2. **Test executions are in-memory only** (`activeTests` map, `testService.ts:48`). Restart the API and the tests list and every test-detail page 404 (`getAllTests`/`getTestStatus` never read storage), even though `result.json` files exist on disk. The map also grows unboundedly.
3. **Duplicate `eventIndex` misaligns pairs.** If the last event is screenshot-worthy (a click usually is), it emits index `events.length` and the unconditional "final" shot emits `events.length` again (`player.ts:120-138`). `buildPairs` matches by index with `.find()` (`testService.ts:295`), so the baseline's *final* frame is compared against the head's *click* frame — a spurious diff whenever async rendering lands between the two.
4. **Failed comparisons vanish.** A pair that throws in `compareScreenshotSets` is logged and dropped (`packages/lib/differ/src/comparison.ts:54-56`), so a corrupt screenshot makes the report *smaller* instead of failed. Same pattern in `buildPairs`: baseline frames with no head counterpart are silently skipped — a replay that produced 3 of 10 frames still compares only those 3.
5. **The differ scales mismatched images with `fit: 'contain'`** (`packages/lib/differ/src/differ.ts:105-120`), which letterboxes and *centers* the smaller image. Two screenshots differing only in height become almost-100%-different. Visual diffing should pad (anchor top-left), never scale. Rarely triggered today only because the viewport is fixed.
6. **`removeEventListener('beforeunload', this.handleBeforeUnload.bind(this))`** (`packages/lib/recorder/src/recorder.ts:128`) removes a freshly-bound function — i.e., never removes anything; repeated `start()`/`stop()` stacks duplicate listeners.
7. **Dead API options.** `viewport` and `timeout` are accepted on `POST /:id/replay` (`packages/app/api/src/routes/sessions.ts:215-221`) and `ignoreRegions` on `/compare` — none is ever used (`PlayerConfig` is fixed at construction; `differ.compareScreenshots` merges only `threshold` and `pixelMatchOptions`). Silent no-ops that look like features.
8. **Concurrent first replays of one session race the baseline.** Queue concurrency is 2; both runs see `hasBaseline === false` and interleave their screenshots into one mixed baseline directory.

---

## C. Security / privacy posture

Inherent to the design but worth stating plainly: sessions contain plaintext input values (the sensitive-field heuristic at `eventCapture.ts:327-340` is deny-list, not mask-by-default), full request/response bodies *including `Authorization` headers*, and the entire cookie/localStorage snapshot (live JWTs) — stored unencrypted and served by an API with `cors()` wide-open and zero auth.

The JWT `exp`-patching trick (`player.ts:417-440`) also breaks the token signature, so it only helps against client-side expiry checks — any server-verified token still fails on unmocked requests.

Fine for a localhost POC; it is the first thing to redesign before any shared deployment, because this database is effectively a credential store.

---

## D. Performance / scale

- **Replay cost is dominated by no-op events.** Every event sleeps 150ms, including `mousemove` (recorded at 10/s, never replayed) and `mutation`/`blur` (also never replayed). A 60-second session with continuous mouse movement adds ~90 seconds of pure sleep. Mutations are captured in detail (selector-serialized, `eventCapture.ts:263-286`) yet consumed by nothing — pure session bloat.
- **O(n²) session writes.** Every upload batch re-reads, re-merges, and rewrites the entire `session.json` plus the whole per-project index (`sessionService.mergeAndSave` → `fileStorage.saveSession`). Long sessions get expensive fast.
- **`sendBeacon` payloads over ~64KB are rejected by browsers**, so the unload-time flush of a session with network bodies will often silently drop the tail of the recording.

---

## E. What's genuinely good

Worth saying because it is a lot:

- The **e2e harness is excellent** — hermetic, parallel, three fixed-mode origins, asserts the four claims that matter including cross-origin rebasing.
- The **storage abstraction** is clean and actually pluggable.
- The **URL-rebase design** (per-session source origin, cross-origin URLs preserved) is the right model for preview-deployment testing.
- The **per-session save-chain with merge-by-id** correctly solves the incremental-upload/beacon race.
- The **sendBeacon `text/plain` preflight workaround** is documented at both ends (recorder and API).
- The **UI is honest about stubs** instead of faking them.
- **Docs are unusually accurate** — the README's "not yet built" list matches reality, with the one `__taka_replay` exception above (`CLAUDE.md` still says "SQLite for POC," which the code never had).

---

## F. Is the solution useful?

The thesis itself is validated demand — it is essentially Meticulous.ai's pitch (record sessions, replay against PRs, diff screenshots, zero test-writing). So "not useful" is not the conclusion. But the value in that category is *entirely* in fidelity and determinism on messy real-world apps; the recording/diffing plumbing is the easy 20%.

Right now Taka works on apps that are: fully client-rendered, animation-free, clock-free, with stable non-hashed selectors, gzip-free APIs, and deterministic data — i.e., the fixture. Each section-A item widens the set of real apps it works on.

### Recommended order of attack

1. **Fix the threshold default** (percentage OR absolute-pixel gate) — one line; changes the product from "misses everything" to "catches things."
2. **Add the `__taka_replay` guard in the SDK** — docs already promise it.
3. **Build the re-baseline/approve endpoint** — roadmap #1, correctly prioritized.
4. **Inject determinism at replay** — disable animations/caret, freeze time/random, wait-for-idle instead of fixed sleeps; use the recorded viewport.
5. **Persist test executions; fix `nth-of-type`, the duplicate final-frame index, and pad-don't-scale in the differ.**
