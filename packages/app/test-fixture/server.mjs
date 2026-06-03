// Minimal, deterministic test fixture for Taka's end-to-end flow.
//
// Serves one page per validation scenario (see scenarios.mjs) at /<id>. Each
// page wires in the recorder via a <script> tag and exposes a deterministic
// interaction. A server-held `mode` flag ("stable" | "regression") applies a
// scenario's regression CSS so the SAME recorded session, replayed after the
// flag is flipped, produces a large, unambiguous pixel diff.
//
// Determinism is enforced by the shared shell (no animations/transitions,
// system fonts, no clocks/random) so stable replays are pixel-identical and
// only the regression flip causes a diff.

import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scenarios, scenarioById } from './scenarios.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.FIXTURE_PORT || 9002);
const PROJECT_ID = process.env.TAKA_PROJECT_ID || '';
const API_ENDPOINT = process.env.TAKA_API_ENDPOINT || 'http://localhost:9001/api';

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

let mode = 'stable'; // flipped at runtime via POST /__mode

// Shared shell — deterministic reset + recorder wiring around a scenario body.
function renderScenario(scenario, isRegression) {
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
${isRegression && scenario.regressionCss ? scenario.regressionCss : ''}
</style>
</head>
<body data-scenario="${scenario.id}">
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
<title>Taka fixture</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 40px; color: #111; }
  code { background: #f0f0f0; padding: 1px 6px; }
  .ev { color: #888; font-size: 12px; }
  li { margin: 8px 0; }
</style>
</head>
<body>
  <h1>Taka test fixture</h1>
  <p>mode: <strong>${mode}</strong> · project: <strong>${PROJECT_ID || 'unset'}</strong></p>
  <ul>
${rows}
  </ul>
</body>
</html>`;
}

const app = express();
app.use(express.json());

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

app.post('/__mode', (req, res) => {
  const next = req.body && req.body.mode;
  if (next !== 'stable' && next !== 'regression') {
    return res.status(400).json({ error: 'mode must be "stable" or "regression"' });
  }
  mode = next;
  console.log('[Fixture] mode →', mode);
  res.json({ mode });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, mode, projectId: PROJECT_ID, scenarios: scenarios.map(s => s.id) });
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
  res.type('html').send(renderScenario(scenario, mode === 'regression'));
});

app.listen(PORT, () => {
  console.log(
    `[Fixture] serving on http://localhost:${PORT} (mode=${mode}, project=${PROJECT_ID || 'unset'}, scenarios=${scenarios
      .map(s => s.id)
      .join(',')})`,
  );
});
