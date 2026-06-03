// Scenario registry for the Taka test fixture.
//
// Each scenario is a self-contained validation case served at /<id>. It owns:
//   - its page (markup + behavior + optional regression styling), and
//   - its e2e definition (how to drive the recording + what to assert).
//
// server.mjs uses the rendering fields; scripts/e2e.mjs uses the `e2e` field.
// Keep every scenario DETERMINISTIC: no clocks, randomness, animations, or
// network-dependent rendering — otherwise stable replays would flake.
//
// Rendering fields:
//   id            URL segment + identifier (e.g. "click" → served at /click)
//   title         human label (shown on the index page)
//   event         the primary recorder event type this validates
//   description   one-line summary
//   css           scenario-specific styles (optional)
//   body          the interactive markup
//   behavior      the page's own JS (a string, injected into a <script>; runs
//                 during BOTH recording and replay)
//   regressionCss CSS applied only in regression mode (optional)
//   hasRegression whether a negative (regression-fail) variant exists
//
// e2e field:
//   record(page)  async — drive the interaction on a Puppeteer page already at
//                 /<id> with the recorder attached
//   checks(events) → [{ pass, label, detail? }]  capture-phase assertions on
//                 the recorded session's events
//   regression    whether to run the regression-fail replay (defaults to
//                 hasRegression)

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
    e2e: {
      record: async page => {
        await page.click('#action-btn');
      },
      checks: events => [
        {
          pass: events.some(e => e.type === 'navigation'),
          label: 'has a navigation event',
          detail: events.map(e => e.type),
        },
        {
          pass: events.some(e => e.type === 'click' && (e.target || '').includes('action-btn')),
          label: 'has a click on #action-btn',
          detail: events.find(e => e.type === 'click'),
        },
      ],
      regression: true,
    },
  },

  {
    id: 'input',
    title: 'Text input echoes',
    event: 'input',
    description: 'Typing into a text field echoes the value into a panel.',
    css: `
      #text-input {
        font: 16px system-ui, sans-serif;
        padding: 12px 14px;
        width: 480px;
        border: 2px solid #111111;
        /* Determinism: kill the blinking caret and the platform focus ring,
           both of which would otherwise flake the diff on a focused field. */
        caret-color: transparent;
        outline: none;
      }
      #text-input:focus { outline: none; }
      #echo {
        margin-top: 32px;
        width: 800px;
        height: 420px;
        display: flex;
        align-items: center;
        justify-content: center;
        font: 700 40px system-ui, sans-serif;
        border: 2px solid #111111;
        background: #ffffff;
        color: #111111;
      }
    `,
    body: `
      <input id="text-input" name="message" type="text" autocomplete="off" />
      <div id="echo"></div>
    `,
    behavior: `
      var inp = document.getElementById('text-input');
      inp.addEventListener('input', function () {
        document.getElementById('echo').textContent = inp.value ? 'you typed: ' + inp.value : '';
      });
    `,
    regressionCss: `
      #echo { background: #ff0033 !important; color: #ffffff !important; }
    `,
    hasRegression: true,
    e2e: {
      record: async page => {
        await page.type('#text-input', 'taka', { delay: 30 });
      },
      checks: events => {
        const inputs = events.filter(
          e => e.type === 'input' && (e.target || '').includes('text-input'),
        );
        const typed = inputs.find(e => e.data && e.data.value === 'taka');
        return [
          {
            pass: inputs.length > 0,
            label: 'has input event(s) on #text-input',
            detail: inputs.map(e => e.data),
          },
          {
            pass: !!typed,
            label: 'captured the typed value "taka"',
            detail: inputs.map(e => e.data && e.data.value),
          },
        ];
      },
      regression: true,
    },
  },
];

export function scenarioById(id) {
  return scenarios.find(s => s.id === id);
}
