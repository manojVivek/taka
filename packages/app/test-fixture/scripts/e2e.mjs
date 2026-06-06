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
// Three fixed-mode fixtures (FIXTURE_MODE set at startup), modeling preview-env
// validation. A session is recorded + baselined on STABLE, then replayed
// cross-domain against two other origins running the same code:
//   - PREVIEW    (stable mode)     → a good preview → replays PASS.
//   - REGRESSION (regression mode) → a regressed preview → replays FAIL.
// Fixed modes (no runtime flip, no shared state) also let scenarios run in
// parallel. The stable fixture doubles as the manual record target in keep mode.
const STABLE_PORT = Number(process.env.E2E_STABLE_PORT || 9002);
const PREVIEW_PORT = Number(process.env.E2E_PREVIEW_PORT || 9003);
const REGRESSION_PORT = Number(process.env.E2E_REGRESSION_PORT || 9004);
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 9000);
const API_BASE = `http://localhost:${API_PORT}/api`;
const STABLE_URL = `http://localhost:${STABLE_PORT}`;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;
const REGRESSION_URL = `http://localhost:${REGRESSION_PORT}`;
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

// Drive a scenario's interaction in a fresh page on the STABLE fixture, flush,
// and return the recorded session (disambiguated by URL so each gets its own).
async function recordScenario(browser, scenario) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('console', m => {
    const t = m.text();
    if (t.includes('[Fixture]') || t.includes('[Taka]')) console.log(`  \x1b[90m[page] ${t}\x1b[0m`);
  });
  try {
    await page.goto(`${STABLE_URL}/${scenario.id}`, { waitUntil: 'networkidle2' });
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

// Run one scenario end to end: record on the stable fixture → capture asserts →
// baseline → replay against the STABLE origin (passes) → replay against the
// REGRESSION origin (fails; this is a cross-origin replay via targetOrigin).
// Output is buffered and printed as one block so parallel runs stay readable,
// and the whole scenario is wrapped so one failure can't abort the others.
async function runScenario(browser, scenario) {
  const lines = [`\n\x1b[36m▶ Scenario "${scenario.id}" — ${scenario.title}\x1b[0m`];
  let localFails = 0;
  const okL = m => lines.push(`  \x1b[32m✓\x1b[0m ${m}`);
  const assertL = (cond, msg, detail) => {
    if (cond) lines.push(`  \x1b[32m✓\x1b[0m ${msg}`);
    else {
      localFails++;
      lines.push(`  \x1b[31m✗ ${msg}\x1b[0m`);
      if (detail !== undefined) lines.push(`     ${JSON.stringify(detail, null, 2)?.slice(0, 600)}`);
    }
    return cond;
  };

  try {
    const session = await recordScenario(browser, scenario);
    okL(`recorded session ${session.id.slice(0, 8)} (${session.events.length} events)`);

    for (const c of scenario.e2e.checks(session.events)) {
      assertL(c.pass, `[${scenario.id}] ${c.label}`, c.pass ? undefined : c.detail);
    }

    const r1 = await replayAndWait(session.id, `${scenario.id}#baseline`);
    assertL(r1.result?.isBaseline === true, `[${scenario.id}] first replay created a baseline`, {
      status: r1.test.status,
      isBaseline: r1.result?.isBaseline,
    });

    const r2 = await replayAndWait(session.id, `${scenario.id}#preview`, { targetOrigin: PREVIEW_URL });
    const r2Failed = (r2.result?.diffs ?? []).filter(d => !d.passed);
    assertL(
      r2.test.status === 'completed' && r2Failed.length === 0,
      `[${scenario.id}] cross-domain replay against the preview origin PASSES`,
      { status: r2.test.status, failing: r2Failed.length },
    );

    const wantRegression = scenario.e2e.regression ?? scenario.hasRegression;
    if (wantRegression) {
      const r3 = await replayAndWait(session.id, `${scenario.id}#regression`, {
        targetOrigin: REGRESSION_URL,
      });
      const r3Failed = (r3.result?.diffs ?? []).filter(d => !d.passed);
      assertL(
        r3.test.status === 'failed' && r3Failed.length >= 1,
        `[${scenario.id}] replay against the regression origin FAILS (≥1 failing diff)`,
        { status: r3.test.status, failing: r3Failed.length },
      );
      assertL(
        r3.result?.targetOrigin === REGRESSION_URL,
        `[${scenario.id}] regression run is cross-origin (target ${REGRESSION_URL})`,
        { targetOrigin: r3.result?.targetOrigin, sourceOrigin: r3.result?.sourceOrigin },
      );
      if (r3Failed.length) {
        const worst = Math.max(...r3Failed.map(d => d.percentageDifference));
        okL(`[${scenario.id}] largest diff ${(worst * 100).toFixed(1)}% (threshold ${(r3Failed[0].threshold * 100).toFixed(0)}%)`);
      }
    }
  } catch (e) {
    localFails++;
    lines.push(`  \x1b[31m✗ [${scenario.id}] errored: ${e.message}\x1b[0m`);
  }

  failures += localFails;
  console.log(lines.join('\n'));
}

// ---- keep-alive (E2E_KEEP=1) ----------------------------------------------
async function keepAlive() {
  // The three fixed-mode fixtures from the run stay up; the stable one doubles
  // as the manual record target. Boot the dashboard (prebuilt by `make e2e`) so
  // there's a real UI to play in.
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
  dashboard    ${WEB_URL}/projects/${PROJECT_ID}
  \x1b[32mrecord →\x1b[0m     ${STABLE_URL}   ← open ${scenarios.map(s => '/' + s.id).join(' or ')} and interact to capture a NEW session
  preview      ${PREVIEW_URL}   (good preview — replay against it in the dialog → PASSES)
  regression   ${REGRESSION_URL}   (regressed preview — replay against it → FAILS)
  api          ${API_BASE}
  project      ${PROJECT_ID}   (pre-loaded: one session + test runs per scenario)
  data dir     ${dataDir}   (temp — removed on teardown)

  Manual flow: open the \x1b[32mrecord\x1b[0m URL → click/type → switch to the dashboard →
  the new session appears under sessions → Replay it, targeting ${PREVIEW_URL}
  (passes) or ${REGRESSION_URL} (fails) in the Replay dialog.

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

  step('Start fixtures — stable (record/baseline), preview (stable), regression');
  const startFixture = (label, port, mode) =>
    spawnProc(label, 'node', ['packages/app/test-fixture/server.mjs'], {
      FIXTURE_PORT: String(port),
      FIXTURE_MODE: mode,
      TAKA_PROJECT_ID: PROJECT_ID,
      TAKA_API_ENDPOINT: API_BASE,
    });
  startFixture('stable', STABLE_PORT, 'stable');
  startFixture('preview', PREVIEW_PORT, 'stable');
  startFixture('regression', REGRESSION_PORT, 'regression');
  await Promise.all(
    [
      ['stable', STABLE_URL],
      ['preview', PREVIEW_URL],
      ['regression', REGRESSION_URL],
    ].map(([label, url]) =>
      waitFor(`${label} fixture health`, async () => {
        const { status } = await fetchJson(`${url}/health`);
        return status === 200;
      }),
    ),
  );
  ok('fixtures are healthy (stable, preview, regression)');

  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    console.log(`\n  running ${scenarios.length} scenario(s) in parallel: ${scenarios.map(s => s.id).join(', ')}`);
    // Fixed-mode fixtures mean no shared state between scenarios, so they run
    // concurrently. Each replays cross-domain against preview (pass) + regression
    // (fail), which is what exercises the cross-origin rebasing — no separate
    // cross-origin step needed.
    await Promise.all(scenarios.map(scenario => runScenario(browser, scenario)));
  } finally {
    await browser.close();
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
