#!/usr/bin/env node

/**
 * UI Automation Script for the Notes Test App
 *
 * Continuously generates user interactions (create, edit, delete, search, scroll)
 * to produce session recording data for the Taka recorder SDK.
 *
 * Usage: node scripts/automate.mjs [--rounds=N] [--delay=MS]
 */

import puppeteer from 'puppeteer-core';

const APP_URL = 'http://localhost:3002';
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace('--', '').split('=');
    return [k, v];
  })
);
const MAX_ROUNDS = parseInt(args.rounds) || Infinity;
const BASE_DELAY = parseInt(args.delay) || 800;

const SAMPLE_TITLES = [
  'Meeting Notes', 'Shopping List', 'Project Ideas', 'Daily Journal',
  'Recipe: Pasta', 'Book Recommendations', 'Workout Plan', 'Travel Itinerary',
  'Bug Report', 'Sprint Retrospective', 'Design Feedback', 'Code Review Notes',
  'Weekly Goals', 'Birthday Plans', 'Movie Watchlist', 'Learning Resources',
];

const SAMPLE_CONTENT = [
  'Remember to follow up with the team about the deployment schedule.',
  'Milk, eggs, bread, butter, coffee beans, fresh vegetables.',
  'Build a CLI tool for automated testing. Consider using TypeScript.',
  'Today was productive. Finished the API integration and fixed 3 bugs.',
  'Boil pasta for 8 minutes. Sauce: garlic, tomatoes, basil, olive oil.',
  'The Pragmatic Programmer, Clean Code, Designing Data-Intensive Apps.',
  'Monday: Chest & Triceps. Tuesday: Back & Biceps. Wednesday: Legs.',
  'Flight at 9am. Hotel check-in at 2pm. Dinner reservation at 7pm.',
  'Login page crashes when password field is empty. Steps to reproduce...',
  'What went well: shipping on time. Improve: better estimation.',
  'The new color scheme looks great. Consider increasing button padding.',
  'Function at line 42 has O(n^2) complexity. Refactor to use a hash map.',
  'Ship the feature by Friday. Write tests by Wednesday. Deploy Monday.',
  'Get a cake from the bakery. Order balloons. Send invitations.',
  'Inception, Interstellar, The Matrix, Arrival, Blade Runner 2049.',
  'FreeCodeCamp, Udemy courses, MDN docs, TypeScript handbook.',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDelay(multiplier = 1) {
  return new Promise(r => setTimeout(r, BASE_DELAY * multiplier * (0.5 + Math.random())));
}

async function typeSlowly(page, selector, text) {
  await page.click(selector, { clickCount: 3 }); // select all
  await randomDelay(0.3);
  await page.type(selector, text, { delay: 30 + Math.random() * 50 });
}

async function createNote(page, round) {
  const title = `${pick(SAMPLE_TITLES)} #${round}-${Date.now() % 1000}`;
  const content = pick(SAMPLE_CONTENT);

  console.log(`  [CREATE] "${title}"`);

  await page.click('#note-title');
  await randomDelay(0.3);
  await typeSlowly(page, '#note-title', title);
  await randomDelay(0.5);

  await page.click('#note-content');
  await randomDelay(0.3);
  await typeSlowly(page, '#note-content', content);
  await randomDelay(0.5);

  await page.click('#create-note-btn');
  await randomDelay(1.5); // wait for API response and re-render
}

async function editRandomNote(page) {
  const editButtons = await page.$$('.edit-btn');
  if (editButtons.length === 0) {
    console.log('  [EDIT] No notes to edit, skipping');
    return;
  }

  const btn = pick(editButtons);
  await btn.click();
  await randomDelay(1);

  // Find the visible edit inputs (the ones in the editing form)
  const inputs = await page.$$('input[type="text"]');
  const textareas = await page.$$('textarea');

  // The edit form inputs are the ones that appear after clicking Edit
  // They don't have IDs, so we look for the ones that aren't the main form
  if (inputs.length > 2) {
    // There's an edit title input (not #note-title and not #search-notes)
    const editInput = inputs.find(async (inp) => {
      const id = await inp.evaluate(el => el.id);
      return !id;
    });
    if (editInput) {
      const newTitle = `${pick(SAMPLE_TITLES)} (edited)`;
      console.log(`  [EDIT] Changing title to "${newTitle}"`);
      await editInput.click({ clickCount: 3 });
      await randomDelay(0.3);
      await editInput.type(newTitle, { delay: 30 + Math.random() * 50 });
    }
  }

  if (textareas.length > 1) {
    const editTextarea = textareas[textareas.length - 1];
    const newContent = pick(SAMPLE_CONTENT) + ' (updated)';
    console.log(`  [EDIT] Updating content`);
    await editTextarea.click({ clickCount: 3 });
    await randomDelay(0.3);
    await editTextarea.type(newContent, { delay: 20 + Math.random() * 40 });
  }

  await randomDelay(0.5);

  // Click Save button
  const saveButtons = await page.$$('button');
  for (const b of saveButtons) {
    const text = await b.evaluate(el => el.textContent);
    if (text === 'Save') {
      await b.click();
      console.log(`  [EDIT] Saved`);
      break;
    }
  }
  await randomDelay(1);
}

async function deleteRandomNote(page) {
  const deleteButtons = await page.$$('.delete-btn');
  if (deleteButtons.length === 0) {
    console.log('  [DELETE] No notes to delete, skipping');
    return;
  }

  // Auto-accept the confirm dialog
  page.once('dialog', async dialog => {
    await dialog.accept();
  });

  const btn = pick(deleteButtons);
  console.log(`  [DELETE] Removing a note`);
  await btn.click();
  await randomDelay(1.5);
}

async function searchNotes(page) {
  const terms = ['Meeting', 'bug', 'code', 'list', 'plan', 'recipe', 'travel', ''];
  const term = pick(terms);
  console.log(`  [SEARCH] Searching for "${term || '(clear)'}"`);

  await page.click('#search-notes', { clickCount: 3 });
  await randomDelay(0.3);
  if (term) {
    await page.type('#search-notes', term, { delay: 50 + Math.random() * 80 });
  } else {
    await page.keyboard.press('Backspace');
  }
  await randomDelay(1);
}

async function scrollPage(page) {
  const direction = Math.random() > 0.5 ? 300 : -300;
  console.log(`  [SCROLL] ${direction > 0 ? 'Down' : 'Up'} ${Math.abs(direction)}px`);
  await page.evaluate((d) => window.scrollBy(0, d), direction);
  await randomDelay(0.5);
}

async function hoverRandomElement(page) {
  const notes = await page.$$('h3');
  if (notes.length === 0) return;
  const el = pick(notes);
  console.log(`  [HOVER] Hovering over a note title`);
  await el.hover();
  await randomDelay(0.5);
}

async function main() {
  console.log('=== Notes App UI Automation ===');
  console.log(`Target: ${APP_URL}`);
  console.log(`Rounds: ${MAX_ROUNDS === Infinity ? 'unlimited' : MAX_ROUNDS}`);
  console.log(`Base delay: ${BASE_DELAY}ms`);
  console.log('Press Ctrl+C to stop\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Log console messages from the page (to see recorder activity)
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Test App]') || text.includes('[Taka]') || text.includes('Recorder')) {
      console.log(`  [PAGE] ${text}`);
    }
  });

  console.log('Navigating to app...');
  await page.goto(APP_URL, { waitUntil: 'networkidle2' });
  await randomDelay(2);

  let round = 0;
  while (round < MAX_ROUNDS) {
    round++;
    console.log(`\n--- Round ${round} ---`);

    // Each round does a mix of actions
    const actions = [];

    // Always create 1-2 notes
    const createCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < createCount; i++) {
      actions.push(() => createNote(page, round));
    }

    // Sometimes edit (60% chance)
    if (Math.random() < 0.6) {
      actions.push(() => editRandomNote(page));
    }

    // Sometimes search (50% chance)
    if (Math.random() < 0.5) {
      actions.push(() => searchNotes(page));
    }

    // Sometimes scroll (70% chance)
    if (Math.random() < 0.7) {
      actions.push(() => scrollPage(page));
    }

    // Sometimes hover (40% chance)
    if (Math.random() < 0.4) {
      actions.push(() => hoverRandomElement(page));
    }

    // Occasionally delete (30% chance, but only after round 3)
    if (round > 3 && Math.random() < 0.3) {
      actions.push(() => deleteRandomNote(page));
    }

    // Clear search at the end to see all notes
    actions.push(() => searchNotes(page));

    // Shuffle actions (except last one which clears search)
    const lastAction = actions.pop();
    for (let i = actions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [actions[i], actions[j]] = [actions[j], actions[i]];
    }
    actions.push(lastAction);

    // Execute actions sequentially
    for (const action of actions) {
      try {
        await action();
      } catch (err) {
        console.log(`  [ERROR] ${err.message}`);
      }
    }

    // Pause between rounds
    console.log(`  Round ${round} complete. Pausing...`);
    await randomDelay(2);
  }

  console.log('\n=== Automation complete ===');
  await browser.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
