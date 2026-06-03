// Scenario registry for the Taka test fixture.
//
// Each scenario is a self-contained validation page served at /<id>. It owns
// its own markup, behavior (the page's own JS — runs during BOTH recording and
// replay), optional scenario CSS, and an optional regression variant (CSS
// applied when the server is flipped to regression mode, to force a failing
// visual diff on replay).
//
// The e2e orchestrator (scripts/e2e.mjs) records and replays each scenario and
// asserts the resulting recorder events / diffs. Keep every scenario
// DETERMINISTIC: no clocks, randomness, animations, or network-dependent
// rendering — otherwise stable replays would flake.
//
// Fields:
//   id            URL segment + identifier (e.g. "click" → served at /click)
//   title         human label (shown on the index page)
//   event         the primary recorder event type this validates
//   description   one-line summary
//   css           scenario-specific styles (optional)
//   body          the interactive markup
//   behavior      the page's own JS (a string, injected into a <script>)
//   regressionCss CSS applied only in regression mode (optional)
//   hasRegression whether a negative (regression-fail) variant exists

export const scenarios = [
  {
    id: 'click',
    title: 'Click reveals text',
    event: 'click',
    description: 'A button that reveals static text on click.',
    css: `
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
        background: #ffffff;
        color: #111111;
      }
    `,
    body: `
      <button id="action-btn">Reveal</button>
      <div id="output"></div>
    `,
    behavior: `
      document.getElementById('action-btn').addEventListener('click', function () {
        document.getElementById('output').textContent = 'Hello, Taka!';
      });
    `,
    regressionCss: `
      #output { background: #ff0033 !important; color: #ffffff !important; }
    `,
    hasRegression: true,
  },
];

export function scenarioById(id) {
  return scenarios.find(s => s.id === id);
}
