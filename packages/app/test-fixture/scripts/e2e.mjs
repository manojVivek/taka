#!/usr/bin/env node
/**
 * Hermetic end-to-end test for the full Taka pipeline.
 *
 * Spawns its own API (filesystem storage in a temp dir) and the fixture server,
 * drives a real Chrome to record a session, then proves the four core claims:
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
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

const API_PORT = 3001;
const FIXTURE_PORT = 3003;
const WEB_PORT = 3000;
const API_BASE = `http://localhost:${API_PORT}/api`;
const FIXTURE_URL = `http://localhost:${FIXTURE_PORT}`;
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
async function replayAndWait(sessionId, label) {
  const { body: started } = await fetchJson(
    `${API_BASE}/projects/${PROJECT_ID}/sessions/${sessionId}/replay`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
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
    fail('dashboard did not come up (continuing — API + fixture are still usable)');
  }

  console.log(`
\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m
\x1b[32m  servers are up — play around, then press Ctrl+C to tear down\x1b[0m
\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m
  dashboard   ${WEB_URL}/projects/${PROJECT_ID}
  fixture     ${FIXTURE_URL}        (POST /__mode {"mode":"regression"|"stable"} to toggle)
  api         ${API_BASE}
  project     ${PROJECT_ID}   (1 recorded session, 3 test runs: baseline / pass / fail)
  data dir    ${dataDir}   (temp — removed on teardown)

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

  step('Record a session (drive Chrome, click the button)');
  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('console', m => {
      const t = m.text();
      if (t.includes('[Fixture]') || t.includes('[Taka]')) console.log(`  \x1b[90m[page] ${t}\x1b[0m`);
    });
    await page.goto(FIXTURE_URL, { waitUntil: 'networkidle2' });
    await waitFor('recorder to attach', () => page.evaluate(() => !!window.__takaRecorder));
    await page.click('#action-btn');
    await sleep(500);
    // Force a synchronous flush of the buffer, then give the upload a moment.
    await page.evaluate(() => window.__takaRecorder.stop());
    await sleep(500);
    await page.close();
  } finally {
    await browser.close();
  }
  ok('recorded one click interaction');

  step('Assert events flowed through to the API');
  const session = await waitFor('session to arrive with a click event', async () => {
    const { body } = await fetchJson(`${API_BASE}/projects/${PROJECT_ID}/sessions?limit=1`);
    const s = body?.sessions?.[0];
    if (!s) return null;
    const { body: full } = await fetchJson(
      `${API_BASE}/projects/${PROJECT_ID}/sessions/${s.id}`,
    );
    const hasClick = full?.events?.some(e => e.type === 'click');
    return hasClick ? full : null;
  });
  const types = session.events.map(e => e.type);
  assert(types.includes('navigation'), 'session has a navigation event', types);
  const click = session.events.find(e => e.type === 'click');
  assert(
    click && typeof click.target === 'string' && click.target.includes('action-btn'),
    'session has a click on #action-btn',
    click,
  );

  step('Replay #1 — establishes baseline (stable mode)');
  const r1 = await replayAndWait(session.id, 'replay#1');
  assert(r1.result?.isBaseline === true, 'first replay created a baseline', {
    status: r1.test.status,
    isBaseline: r1.result?.isBaseline,
  });

  step('Replay #2 — unchanged page should PASS');
  const r2 = await replayAndWait(session.id, 'replay#2');
  const r2Failed = (r2.result?.diffs ?? []).filter(d => !d.passed);
  assert(r2.test.status === 'completed', 'stable replay status is completed (passed)', {
    status: r2.test.status,
  });
  assert(r2Failed.length === 0, 'stable replay has no failing diffs', {
    diffs: (r2.result?.diffs ?? []).map(d => ({ idx: d.headScreenshot?.eventIndex, pct: d.percentageDifference, passed: d.passed })),
  });

  step('Flip fixture to regression mode');
  const { body: flip } = await fetchJson(`${FIXTURE_URL}/__mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'regression' }),
  });
  assert(flip?.mode === 'regression', 'fixture is now in regression mode');

  step('Replay #3 — changed page should FAIL (regression detected)');
  const r3 = await replayAndWait(session.id, 'replay#3');
  const r3Failed = (r3.result?.diffs ?? []).filter(d => !d.passed);
  assert(r3.test.status === 'failed', 'regression replay status is failed', { status: r3.test.status });
  assert(r3Failed.length >= 1, 'regression replay has ≥1 failing diff', {
    diffs: (r3.result?.diffs ?? []).map(d => ({ idx: d.headScreenshot?.eventIndex, pct: d.percentageDifference, passed: d.passed })),
  });
  if (r3Failed.length) {
    const worst = Math.max(...r3Failed.map(d => d.percentageDifference));
    ok(`largest diff = ${(worst * 100).toFixed(1)}% of viewport (threshold ${(r3Failed[0].threshold * 100).toFixed(0)}%)`);
  }
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
