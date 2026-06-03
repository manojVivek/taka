// Minimal, deterministic test fixture for Taka's end-to-end flow.
//
// Serves a single page with one button that reveals static text on click.
// A server-held `mode` flag ("stable" | "regression") flips the revealed
// text's background to red — producing a large, unambiguous pixel diff when
// the SAME recorded session is replayed after the flag is toggled.
//
// The page is deliberately deterministic: no clocks, no animations/transitions,
// system fonts, fixed-size output panel, static text — so stable replays are
// pixel-identical and only the regression flip causes a diff.

import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.FIXTURE_PORT || 3003);
const PROJECT_ID = process.env.TAKA_PROJECT_ID || '';
const API_ENDPOINT = process.env.TAKA_API_ENDPOINT || 'http://localhost:3001/api';

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

function pageHtml() {
  const regression = mode === 'regression';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Taka fixture</title>
<style>
  * { transition: none !important; animation: none !important; box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #ffffff;
    color: #111111;
    padding: 40px;
  }
  #action-btn {
    font: 600 18px system-ui, sans-serif;
    padding: 16px 28px;
    border: 2px solid #111111;
    background: #ffffff;
    color: #111111;
    cursor: pointer;
  }
  /* Large fixed-size panel so the regression color flip clears the diff threshold. */
  #output {
    margin-top: 32px;
    width: 800px;
    height: 400px;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 700 48px system-ui, sans-serif;
    border: 2px solid #111111;
    background: ${regression ? '#ff0033' : '#ffffff'};
    color: ${regression ? '#ffffff' : '#111111'};
  }
</style>
</head>
<body>
  <h1>Taka test fixture</h1>
  <button id="action-btn">Reveal</button>
  <div id="output"></div>

  <script src="/recorder.js"></script>
  <script>
    // The page's own behavior — runs during BOTH recording and replay.
    document.getElementById('action-btn').addEventListener('click', function () {
      document.getElementById('output').textContent = 'Hello, Taka!';
    });

    // Recorder init — skipped during replay (the player sets __taka_replay).
    if (!window.__taka_replay) {
      if (window.TakaRecorder) {
        window.__takaRecorder = window.TakaRecorder.init({
          apiEndpoint: ${JSON.stringify(API_ENDPOINT)},
          projectId: ${JSON.stringify(PROJECT_ID)},
          uploadInterval: 1500,
        });
        console.log('[Fixture] recorder initialized for project', ${JSON.stringify(PROJECT_ID)});
      } else {
        console.error('[Fixture] window.TakaRecorder not found — bundle missing?');
      }
    }
  </script>
</body>
</html>`;
}

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  res.type('html').send(pageHtml());
});

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
  res.json({ ok: true, mode, projectId: PROJECT_ID });
});

app.listen(PORT, () => {
  console.log(`[Fixture] serving on http://localhost:${PORT} (mode=${mode}, project=${PROJECT_ID || 'unset'})`);
});
