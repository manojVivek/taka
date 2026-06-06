#!/usr/bin/env node
/**
 * Hermetic end-to-end test for the full Taka pipeline.
 *
 * Spawns its own API (filesystem storage in a temp dir) and the fixture server,
 * then drives a real Chrome through every scenario in scenarios.mjs. For each
 * scenario it proves the four core claims:
 *   1. events flow through to the API,
 *   2. the first replay establishes a baseline,
 *   3. replaying the unchanged page again PASSES,
 *   4. replaying after a visual change FAILS (regression detected).
 *
 * Everything is torn down on exit. Exit code 0 = all assertions passed.
 *
 * Env:
 *   CHROME_PATH   override Chrome binary (defaults to macOS Google Chrome)
 *   E2E_HEADFUL   set to "1" to launch a visible browser for debugging
 *   E2E_KEEP      set to "1" to leave servers up afterward (Ctrl+C to tear down)
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { scenarios } from '../scenarios.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

// Ports default to the 9xxx series but are env-overridable, so the e2e can run
// on an alternate range (e.g. E2E_API_PORT=9101 …) alongside a `make e2e-keep`
// session that's holding the defaults.
const API_PORT = Number(process.env.E2E_API_PORT || 9001);
const FIXTURE_PORT = Number(process.env.E2E_FIXTURE_PORT || 9002);
// A second fixture instance on another port stands in for a Vercel-style
// "preview" deployment — the target a recorded session is replayed against to
// validate it cross-origin. Same server code as the primary fixture.
const PREVIEW_PORT = Number(process.env.E2E_PREVIEW_PORT || 9003);
// A dedicated recorder-mode fixture, started only in keep mode (E2E_KEEP), as a
// manual sandbox: open it in a browser and interact to capture fresh sessions
// into the project — kept separate from the two fixtures above, whose modes the
// automated run toggles.
const RECORD_PORT = Number(process.env.E2E_RECORD_PORT || 9004);
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 9000);
const API_BASE = `http://localhost:${API_PORT}/api`;
const FIXTURE_URL = `http://localhost:${FIXTURE_PORT}`;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;
const RECORD_URL = `http://localhost:${RECORD_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const PROJECT_ID = 'e2e';
const CHROME_PATH =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HEADFUL = process.env.E2E_HEADFUL === '1';
// Keep mode: after the flow, leave API + fixture + dashboard running so you can
// poke around; Ctrl+C triggers teardown (and temp-dir cleanup).
const KEEP = process.env.E2E_KEEP === '1';

const children = [];
let dataDir;
let failures = 0;
let tornDown = false;

// ---- tiny test harness ----------------------------------------------------
function step(name) {
  console.log(`\n\x1b[36m▶ ${name}\x1b[0m`);
}
function ok(msg) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}
function fail(msg) {
  failures++;
  console.log(`  \x1b[31m✗ ${msg}\x1b[0m`);
}
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else {
    fail(msg);
    if (detail !== undefined) console.log('    ', JSON.stringify(detail, null, 2)?.slice(0, 800));
  }
  return cond;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function waitFor(label, fn, { timeout = 60_000, interval = 500 } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const v = await fn();
      if (v) return v;
      last = v;
    } catch (e) {
      last = e.message;
    }
    await sleep(interval);
  }
  throw new Error(`timed out waiting for ${label} (last: ${JSON.stringify(last)?.slice(0, 200)})`);
}

function spawnProc(label, cmd, args, env) {
  const child = spawn(cmd, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: 'pipe',
    // Own process group so teardown can kill the whole subtree (e.g. pnpm →
    // next start, or the API → its Puppeteer Chrome) via the negative pid.
    detached: true,
  });
  children.push(child);
  const tag = `\x1b[90m[${label}]\x1b[0m`;
  child.stdout.on('data', d =>
    d.toString().split('\n').filter(Boolean).forEach(l => console.log(`${tag} ${l}`)),
  );
  child.stderr.on('data', d =>
    d.toString().split('\n').filter(Boolean).forEach(l => console.log(`${tag} ${l}`)),
  );
  child.on('exit', code => {
    if (code && code !== 0 && code !== null) console.log(`${tag} exited with code ${code}`);
  });
  return child;
}

function killGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal); // negative pid → whole process group
  } catch {
    // group already gone; fall back to the direct child
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

async function teardown() {
  if (tornDown) return;
  tornDown = true;
  // SIGTERM the whole process group first so the API can run its graceful
  // shutdown (closes the Puppeteer browser) and grandchildren (pnpm → next)
  // get the signal too, then SIGKILL any survivors.
  for (const c of children) killGroup(c, 'SIGTERM');
  await sleep(1500);
  for (const c of children) killGroup(c, 'SIGKILL');
  if (dataDir) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

// ---- replay helper --------------------------------------------------------
async function replayAndWait(sessionId, label, body = {}) {
  const { body: started } = await fetchJson(
    `${API_BASE}/projects/${PROJECT_ID}/sessions/${sessionId}/replay`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const testId = started?.testId;
  if (!testId) throw new Error(`${label}: replay did not return a testId (${JSON.stringify(started)})`);

  const test = await waitFor(`${label} test ${testId} to finish`, async () => {
    const { body } = await fetchJson(`${API_BASE}/projects/${PROJECT_ID}/tests/${testId}`);
    if (body && (body.status === 'completed' || body.status === 'failed')) return body;
    return null;
  });
  const { body: result } = await fetchJson(
    `${API_BASE}/projects/${PROJECT_ID}/tests/${testId}/result`,
  );
  return { testId, test, result };
}

async function setMode(mode, base = FIXTURE_URL) {
  const { body } = await fetchJson(`${base}/__mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  return body?.mode;
}

// Drive a scenario's interaction in a fresh page, flush, and return the
// recorded session (disambiguated by URL so each scenario gets its own).
async function recordScenario(browser, scenario) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('console', m => {
    const t = m.text();
    if (t.includes('[Fixture]') || t.includes('[Taka]')) console.log(`  \x1b[90m[page] ${t}\x1b[0m`);
  });
  try {
    await page.goto(`${FIXTURE_URL}/${scenario.id}`, { waitUntil: 'networkidle2' });
    await waitFor('recorder to attach', () => page.evaluate(() => !!window.__takaRecorder));
    await scenario.e2e.record(page);
    await sleep(500);
    await page.evaluate(() => window.__takaRecorder.stop()); // synchronous flush
    await sleep(500);
  } finally {
    await page.close();
  }

  return waitFor(`session for "${scenario.id}"`, async () => {
    const { body } = await fetchJson(`${API_BASE}/projects/${PROJECT_ID}/sessions?limit=50`);
    const summary = (body?.sessions || []).find(s => s.url && s.url.endsWith(`/${scenario.id}`));
    if (!summary) return null;
    const { body: full } = await fetchJson(
      `${API_BASE}/projects/${PROJECT_ID}/sessions/${summary.id}`,
    );
    // Need at least the initial navigation + the interaction's event(s).
    return full && full.events && full.events.length > 1 ? full : null;
  });
}

// Run one scenario end to end: record → capture asserts → baseline → stable
// pass → (optional) regression fail. Each scenario starts in stable mode.
async function runScenario(browser, scenario) {
  step(`Scenario "${scenario.id}" — ${scenario.title}`);
  await setMode('stable');

  const session = await recordScenario(browser, scenario);
  ok(`recorded session ${session.id.slice(0, 8)} (${session.events.length} events)`);

  for (const c of scenario.e2e.checks(session.events)) {
    assert(c.pass, `[${scenario.id}] ${c.label}`, c.pass ? undefined : c.detail);
  }

  const r1 = await replayAndWait(session.id, `${scenario.id}#baseline`);
  assert(r1.result?.isBaseline === true, `[${scenario.id}] first replay created a baseline`, {
    status: r1.test.status,
    isBaseline: r1.result?.isBaseline,
  });

  const r2 = await replayAndWait(session.id, `${scenario.id}#stable`);
  const r2Failed = (r2.result?.diffs ?? []).filter(d => !d.passed);
  assert(
    r2.test.status === 'completed' && r2Failed.length === 0,
    `[${scenario.id}] unchanged replay passes (no failing diffs)`,
    { status: r2.test.status, failing: r2Failed.length },
  );

  const wantRegression = scenario.e2e.regression ?? scenario.hasRegression;
  if (wantRegression) {
    await setMode('regression');
    const r3 = await replayAndWait(session.id, `${scenario.id}#regression`);
    const r3Failed = (r3.result?.diffs ?? []).filter(d => !d.passed);
    assert(
      r3.test.status === 'failed' && r3Failed.length >= 1,
      `[${scenario.id}] regression replay fails (≥1 failing diff)`,
      { status: r3.test.status, failing: r3Failed.length },
    );
    if (r3Failed.length) {
      const worst = Math.max(...r3Failed.map(d => d.percentageDifference));
      ok(`[${scenario.id}] largest diff ${(worst * 100).toFixed(1)}% (threshold ${(r3Failed[0].threshold * 100).toFixed(0)}%)`);
    }
    await setMode('stable'); // leave clean for the next scenario
  }
}

// ---- cross-origin (preview-environment) validation ------------------------
// Record-on-A / replay-on-B: prove a session recorded on the primary fixture
// (:9002) can be replayed against a *different* origin — the "preview" (:9003) —
// via `targetOrigin`, diffing against the baseline captured on the original
// origin. Both ports run the same fixture code, so B-stable matches A's
// baseline (pass), while flipping B to regression yields a failing diff. This
// reuses the click session recorded in the scenario loop (its baseline was
// established on A), so it must run after the loop.
async function crossOriginCheck() {
  step('Cross-origin replay — recorded on :9002, replayed against :9003 (preview)');

  const { body: list } = await fetchJson(`${API_BASE}/projects/${PROJECT_ID}/sessions?limit=50`);
  const summary = (list?.sessions || []).find(s => s.url && s.url.endsWith('/click'));
  if (
    !assert(
      !!summary,
      'found the recorded click session to reuse (baseline captured on :9002)',
      (list?.sessions || []).map(s => s.url),
    )
  ) {
    return;
  }
  const sessionId = summary.id;

  // Both origins render identically in stable mode before the matching replay.
  await setMode('stable', FIXTURE_URL);
  await setMode('stable', PREVIEW_URL);

  const pass = await replayAndWait(sessionId, 'xorigin#stable', { targetOrigin: PREVIEW_URL });
  const passFailing = (pass.result?.diffs ?? []).filter(d => !d.passed);
  assert(
    pass.test.status === 'completed' && passFailing.length === 0,
    'replay against preview (stable) PASSES — rebased nav matched the baseline',
    { status: pass.test.status, failing: passFailing.length },
  );
  assert(
    pass.result?.targetOrigin === PREVIEW_URL,
    `test result records target origin = ${PREVIEW_URL}`,
    { targetOrigin: pass.result?.targetOrigin, sourceOrigin: pass.result?.sourceOrigin },
  );

  await setMode('regression', PREVIEW_URL);
  const failr = await replayAndWait(sessionId, 'xorigin#regression', { targetOrigin: PREVIEW_URL });
  const failFailing = (failr.result?.diffs ?? []).filter(d => !d.passed);
  assert(
    failr.test.status === 'failed' && failFailing.length >= 1,
    'replay against preview (regression) FAILS — visual change detected on the preview',
    { status: failr.test.status, failing: failFailing.length },
  );
  await setMode('stable', PREVIEW_URL); // leave the preview clean
}

// ---- keep-alive (E2E_KEEP=1) ----------------------------------------------
async function keepAlive() {
  // Reset the fixture to stable so the page renders normally when opened.
  try {
    await fetchJson(`${FIXTURE_URL}/__mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'stable' }),
    });
  } catch {
    /* fixture may be down; ignore */
  }

  // Start a dedicated recorder-mode app for manual play. Same scenarios, its own
  // origin, recording into the same project — so sessions you capture by hand
  // show up in the dashboard below, ready to replay/test. (The two automated
  // fixtures are also still up but their modes get toggled by the run.)
  step('Keep-alive — starting manual recorder app');
  spawnProc('record', 'node', ['packages/app/test-fixture/server.mjs'], {
    FIXTURE_PORT: String(RECORD_PORT),
    TAKA_PROJECT_ID: PROJECT_ID,
    TAKA_API_ENDPOINT: API_BASE,
  });
  try {
    await waitFor(
      'manual recorder',
      async () => {
        const { status } = await fetchJson(`${RECORD_URL}/health`);
        return status === 200;
      },
      { timeout: 15_000, interval: 500 },
    );
    ok('manual recorder ready');
  } catch {
    fail('manual recorder did not come up (continuing — the other servers are usable)');
  }

  // Boot the dashboard (prebuilt by `make e2e`) so there's a real UI to play in.
  step('Keep-alive — starting web dashboard');
  spawnProc('web', 'pnpm', ['--filter', '@taka/web', 'start'], { PORT: String(WEB_PORT) });
  try {
    await waitFor(
      'web dashboard',
      async () => {
        const r = await fetch(WEB_URL).catch(() => null);
        return r && r.ok;
      },
      { timeout: 40_000, interval: 1000 },
    );
    ok('dashboard ready');
  } catch {
    fail('dashboard did not come up (continuing — API + fixtures are still usable)');
  }

  console.log(`
\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m
\x1b[32m  servers are up — play around, then press Ctrl+C to tear down\x1b[0m
\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m
  dashboard   ${WEB_URL}/projects/${PROJECT_ID}
  \x1b[32mrecord →\x1b[0m    ${RECORD_URL}   ← open ${scenarios.map(s => '/' + s.id).join(' or ')} and interact to capture a NEW session
  fixture     ${FIXTURE_URL}   (the automated run's record source — its sessions are pre-loaded above)
  preview     ${PREVIEW_URL}   (cross-origin replay target — enter it in the Replay dialog)
  api         ${API_BASE}
  project     ${PROJECT_ID}   (pre-loaded: one recorded session + test runs per scenario)
  data dir    ${dataDir}   (temp — removed on teardown)

  Manual flow: open the \x1b[32mrecord\x1b[0m URL → click/type → switch to the dashboard →
  the new session appears under sessions → hit Replay (optionally target ${PREVIEW_URL}).

  Ctrl+C to stop everything and clean up.
`);

  // Block forever; the global SIGINT/SIGTERM handler performs teardown + exit.
  await new Promise(() => {});
}

// ---- main -----------------------------------------------------------------
async function main() {
  // Always clean up on Ctrl+C / SIGTERM — children run in their own process
  // groups (detached) so they won't get the terminal's signal themselves.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      console.log(`\n\x1b[36m▶ ${sig} — tearing down…\x1b[0m`);
      teardown().then(() => process.exit(failures === 0 ? 0 : 1));
    });
  }

  dataDir = mkdtempSync(join(tmpdir(), 'taka-e2e-'));

  step('Start API (filesystem storage, temp data dir)');
  console.log(`  data dir: ${dataDir}`);
  spawnProc('api', 'node', ['packages/app/api/dist/index.js'], {
    PORT: String(API_PORT),
    TAKA_STORAGE: 'file',
    DATA_ROOT: dataDir,
    NODE_ENV: 'development',
  });
  await waitFor('API health', async () => {
    const { status } = await fetchJson(`${API_BASE}/health`);
    return status === 200;
  });
  ok('API is healthy');

  step('Create project');
  const { status: projStatus, body: project } = await fetchJson(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: PROJECT_ID, name: 'e2e' }),
  });
  assert(projStatus === 201 && project?.id === PROJECT_ID, `project "${PROJECT_ID}" created`, project);

  step('Start fixture server');
  spawnProc('fixture', 'node', ['packages/app/test-fixture/server.mjs'], {
    FIXTURE_PORT: String(FIXTURE_PORT),
    TAKA_PROJECT_ID: PROJECT_ID,
    TAKA_API_ENDPOINT: API_BASE,
  });
  await waitFor('fixture health', async () => {
    const { status } = await fetchJson(`${FIXTURE_URL}/health`);
    return status === 200;
  });
  ok('fixture is healthy');

  step('Start preview fixture (cross-origin replay target)');
  spawnProc('preview', 'node', ['packages/app/test-fixture/server.mjs'], {
    FIXTURE_PORT: String(PREVIEW_PORT),
    TAKA_PROJECT_ID: PROJECT_ID,
    TAKA_API_ENDPOINT: API_BASE,
  });
  await waitFor('preview fixture health', async () => {
    const { status } = await fetchJson(`${PREVIEW_URL}/health`);
    return status === 200;
  });
  ok('preview fixture is healthy');

  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    console.log(`\n  running ${scenarios.length} scenario(s): ${scenarios.map(s => s.id).join(', ')}`);
    for (const scenario of scenarios) {
      await runScenario(browser, scenario);
    }
  } finally {
    await browser.close();
  }

  // Cross-origin (preview) validation reuses the recorded click session and
  // only talks to the API + fixtures, so it runs after the browser is closed.
  await crossOriginCheck();
}

main()
  .then(async () => {
    console.log(
      failures === 0
        ? '\n\x1b[32m✓ e2e passed — all assertions green\x1b[0m'
        : `\n\x1b[31m✗ e2e failed — ${failures} assertion(s) failed\x1b[0m`,
    );
    if (KEEP) await keepAlive(); // blocks until Ctrl+C, then falls through to teardown
    await teardown();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async err => {
    console.error(`\n\x1b[31m✗ e2e errored: ${err.message}\x1b[0m`);
    console.error(err.stack);
    await teardown();
    process.exit(1);
  });
