// Minimal, deterministic test fixture for Taka's end-to-end flow.
//
// Serves one page per validation scenario (see scenarios.mjs) at /<id>. Each
// page wires in the recorder via a <script> tag and exposes a deterministic
// interaction.
//
// The render mode is FIXED at startup via the FIXTURE_MODE env var
// ("stable" | "regression") — not flipped at runtime. Run one instance in each
// mode on its own port and you get two origins: replaying a recorded session
// against the stable origin passes (matches its baseline), against the
// regression origin fails (a scenario's regressionCss produces a large diff).
// Fixed modes mean no shared mutable state, so scenarios can run in parallel.
//
// Determinism is enforced by the shared shell (no animations/transitions,
// system fonts, no clocks/random) so stable replays are pixel-identical and
// only the regression styling causes a diff.

import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scenarios, scenarioById } from './scenarios.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.FIXTURE_PORT || 9002);
const PROJECT_ID = process.env.TAKA_PROJECT_ID || '';
const API_ENDPOINT = process.env.TAKA_API_ENDPOINT || 'http://localhost:9001/api';

const MODE = process.env.FIXTURE_MODE || 'stable';
if (MODE !== 'stable' && MODE !== 'regression') {
  console.error(`[Fixture] invalid FIXTURE_MODE="${MODE}" (use "stable" or "regression")`);
  process.exit(1);
}
const IS_REGRESSION = MODE === 'regression';

// Path to the recorder's standalone IIFE bundle (built by `rollup -c`).
const RECORDER_BUNDLE = join(
  __dirname,
  '..',
  '..',
  'lib',
  'recorder',
  'dist',
  'browser.global.js',
);

// Shared shell — deterministic reset + recorder wiring around a scenario body.
// The regression CSS (if any) is baked in for the whole process when this
// instance runs in regression mode.
function renderScenario(scenario) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Taka fixture · ${scenario.title}</title>
<style>
  * { transition: none !important; animation: none !important; box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #ffffff;
    color: #111111;
    padding: 40px;
  }
  h1 { font-size: 22px; margin: 0 0 24px; }
${scenario.css || ''}
${IS_REGRESSION && scenario.regressionCss ? scenario.regressionCss : ''}
</style>
</head>
<body data-scenario="${scenario.id}" data-mode="${MODE}">
  <h1>${scenario.title}</h1>
  ${scenario.body}

  <script src="/recorder.js"></script>
  <script>
    // The scenario's own behavior — runs during BOTH recording and replay.
    ${scenario.behavior || ''}

    // Recorder init — skipped during replay (the player sets __taka_replay).
    if (!window.__taka_replay) {
      if (window.TakaRecorder) {
        window.__takaRecorder = window.TakaRecorder.init({
          apiEndpoint: ${JSON.stringify(API_ENDPOINT)},
          projectId: ${JSON.stringify(PROJECT_ID)},
          uploadInterval: 1500,
        });
        console.log('[Fixture] recorder initialized — scenario', ${JSON.stringify(scenario.id)}, 'project', ${JSON.stringify(PROJECT_ID)});
      } else {
        console.error('[Fixture] window.TakaRecorder not found — bundle missing?');
      }
    }
  </script>
</body>
</html>`;
}

function renderIndex() {
  const rows = scenarios
    .map(
      s =>
        `<li><a href="/${s.id}"><code>/${s.id}</code></a> — ${s.title} <span class="ev">[${s.event}]</span></li>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Taka fixture (${MODE})</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 40px; color: #111; }
  code { background: #f0f0f0; padding: 1px 6px; }
  .ev { color: #888; font-size: 12px; }
  li { margin: 8px 0; }
</style>
</head>
<body>
  <h1>Taka test fixture</h1>
  <p>mode: <strong>${MODE}</strong> · project: <strong>${PROJECT_ID || 'unset'}</strong></p>
  <ul>
${rows}
  </ul>
</body>
</html>`;
}

const app = express();

// --- reserved routes (registered before the /:id catch-all) ---
app.get('/recorder.js', (_req, res) => {
  try {
    res.type('application/javascript').send(readFileSync(RECORDER_BUNDLE, 'utf8'));
  } catch {
    res
      .status(500)
      .type('application/javascript')
      .send('console.error("[Fixture] recorder bundle not built — run: pnpm --filter @taka/recorder build:browser");');
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, mode: MODE, projectId: PROJECT_ID, scenarios: scenarios.map(s => s.id) });
});

app.get('/', (_req, res) => {
  res.type('html').send(renderIndex());
});

// --- scenario pages ---
app.get('/:id', (req, res) => {
  const scenario = scenarioById(req.params.id);
  if (!scenario) {
    return res.status(404).type('text/plain').send(`unknown scenario: ${req.params.id}`);
  }
  res.type('html').send(renderScenario(scenario));
});

app.listen(PORT, () => {
  console.log(
    `[Fixture] serving on http://localhost:${PORT} (mode=${MODE}, project=${PROJECT_ID || 'unset'}, scenarios=${scenarios
      .map(s => s.id)
      .join(',')})`,
  );
});
