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

  {
    id: 'focus',
    title: 'Focus moves between fields',
    event: 'focus / blur',
    description: 'Focusing one field then another captures focus + blur and highlights the active field.',
    css: `
      .field {
        display: block;
        width: 480px;
        margin-bottom: 14px;
        font: 16px system-ui, sans-serif;
        padding: 12px 14px;
        border: 2px solid #111111;
        background: #ffffff;
        color: #111111;
        /* Determinism: kill the blinking caret and the platform focus ring —
           we draw our own deterministic focus indicator below. */
        caret-color: transparent;
        outline: none;
      }
      .field:focus { border-color: #1f9d2f; background: #eaf7e6; }
      /* Large fixed-size panel so the regression color flip clears the diff threshold. */
      #status {
        margin-top: 18px;
        width: 800px;
        height: 400px;
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
      <input id="field-a" class="field" type="text" autocomplete="off" placeholder="field A" />
      <input id="field-b" class="field" type="text" autocomplete="off" placeholder="field B" />
      <div id="status">idle</div>
    `,
    behavior: `
      var status = document.getElementById('status');
      function watch(id) {
        document.getElementById(id).addEventListener('focus', function () {
          status.textContent = 'focused: #' + id;
        });
      }
      watch('field-a');
      watch('field-b');
    `,
    regressionCss: `
      #status { background: #ff0033 !important; color: #ffffff !important; }
    `,
    hasRegression: true,
    e2e: {
      record: async page => {
        await page.focus('#field-a'); // focus(field-a)
        await page.click('#field-b'); // blur(field-a) + focus(field-b) + click(field-b)
      },
      checks: events => {
        const focuses = events.filter(e => e.type === 'focus');
        const blurs = events.filter(e => e.type === 'blur');
        return [
          {
            pass: focuses.some(e => (e.target || '').includes('field-a')),
            label: 'captured focus on #field-a',
            detail: focuses.map(e => e.target),
          },
          {
            pass: blurs.some(e => (e.target || '').includes('field-a')),
            label: 'captured blur on #field-a (focus moved away)',
            detail: blurs.map(e => e.target),
          },
          {
            pass: focuses.some(e => (e.target || '').includes('field-b')),
            label: 'captured focus on #field-b',
            detail: focuses.map(e => e.target),
          },
        ];
      },
      regression: true,
    },
  },

  {
    id: 'submit',
    title: 'Form submit',
    event: 'submit',
    description: 'Submitting a form (preventDefault) reveals a result panel; the player reproduces the submit.',
    css: `
      #message {
        font: 16px system-ui, sans-serif;
        padding: 12px 14px;
        width: 480px;
        border: 2px solid #111111;
        /* Determinism: no blinking caret (the field isn't focused, but be safe). */
        caret-color: transparent;
        outline: none;
      }
      #submit-btn {
        display: block;
        margin-top: 12px;
        font: 600 16px system-ui, sans-serif;
        padding: 12px 24px;
        border: 2px solid #111111;
        background: #ffffff;
        color: #111111;
        cursor: pointer;
        outline: none; /* no focus ring after the click */
      }
      /* Large fixed-size panel so the regression color flip clears the diff threshold. */
      #result {
        margin-top: 32px;
        width: 800px;
        height: 400px;
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
      <form id="form">
        <input id="message" name="message" type="text" autocomplete="off" value="ship it" />
        <button id="submit-btn" type="submit">Submit</button>
      </form>
      <div id="result">not submitted</div>
    `,
    behavior: `
      document.getElementById('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var v = document.getElementById('message').value;
        document.getElementById('result').textContent = v ? 'submitted: ' + v : 'submitted';
      });
    `,
    regressionCss: `
      #result { background: #ff0033 !important; color: #ffffff !important; }
    `,
    hasRegression: true,
    e2e: {
      record: async page => {
        await page.click('#submit-btn'); // click the submit button → submit(#form)
      },
      checks: events => {
        const submits = events.filter(e => e.type === 'submit');
        return [
          {
            pass: submits.some(e => (e.target || '').includes('form')),
            label: 'captured a submit on #form',
            detail: submits.map(e => e.target),
          },
        ];
      },
      regression: true,
    },
  },

  {
    id: 'scroll',
    title: 'Scroll the page',
    event: 'scroll',
    description: 'Scrolling reveals a below-the-fold panel; the player restores the scroll position so it enters the viewport.',
    css: `
      #top {
        width: 1000px;
        height: 300px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font: 700 36px system-ui, sans-serif;
        border: 2px solid #111111;
        background: #ffffff;
        color: #111111;
      }
      #spacer {
        height: 1100px;
        display: flex;
        align-items: center;
        justify-content: center;
        font: 600 22px system-ui, sans-serif;
        color: #8a8a8a;
      }
      /* #bottom sits below the fold at scrollY=0, so it only enters the (viewport)
         screenshot after the scroll is replayed. The regression flip therefore
         produces a diff ONLY if scrolling actually took effect. */
      #bottom {
        width: 1000px;
        height: 600px;
        margin-top: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font: 700 44px system-ui, sans-serif;
        border: 2px solid #111111;
        background: #ffffff;
        color: #111111;
      }
    `,
    body: `
      <div id="top">top of page</div>
      <div id="spacer">↓ scroll down ↓</div>
      <div id="bottom">bottom panel</div>
    `,
    behavior: ``,
    regressionCss: `
      #bottom { background: #ff0033 !important; color: #ffffff !important; }
    `,
    hasRegression: true,
    e2e: {
      record: async page => {
        // Scroll to the bottom (instant); the player replays the recorded scrollY.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      },
      checks: events => {
        const scrolls = events.filter(e => e.type === 'scroll');
        return [
          {
            pass: scrolls.length > 0,
            label: 'captured scroll event(s)',
            detail: scrolls.map(e => e.data),
          },
          {
            pass: scrolls.some(e => (e.data?.scrollY ?? 0) > 100),
            label: 'scrolled down (scrollY > 100)',
            detail: scrolls.map(e => e.data && e.data.scrollY),
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
