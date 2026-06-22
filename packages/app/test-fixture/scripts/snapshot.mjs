// Test-data snapshot for the e2e flow — dumb dataset, smart comparator.
//
// The committed golden (testdata-snapshot/) is a RAW copy of the session.json and
// result.json files a run writes: original uuids, timestamps, and directory names
// left untouched, no transformation. All the intelligence lives in the comparator.
// `collectCleaned()` reads a storage tree — the golden OR the live run — and
// normalizes it on the fly: it keys sessions by URL path and results by run label,
// and ignores the fields that legitimately change every run/machine. The two
// normalized views are then deep-compared. Volatile data never has to be stripped
// from the committed files because it's ignored at compare time instead.
//
// This pins cross-run determinism — captured events (target + values + rendered
// mutation text), verdicts, frame sets, metadata — so a refactor that silently
// changes what gets captured or replayed fails the gate.
//
// Tradeoff (accepted, by design): because the golden keeps raw uuids/timestamps,
// regenerating it (`make e2e-update-snapshot`) rewrites every file, so its git
// diff is noise. Treat the golden as an opaque blob you regenerate wholesale and
// trust the comparator to validate — not something reviewed field-by-field.
//
// What the comparator ignores (so re-runs compare equal):
//   - identifiers & timing: id, sessionId, *Commit, createdAt/started/completed,
//     every `timestamp`, recordingDuration,
//   - environment: userAgent, targetOrigin/sourceOrigin (env-overridable ports;
//     the run is identified by its session's URL + replay label instead),
//   - geometry that depends on the host's font rendering: x/y, scroll*, document*,
//   - exact diff magnitudes (pixel/percentage — machine-dependent anti-aliasing;
//     only the pass/fail verdict + threshold are pinned),
//   - and it canonicalizes paths for comparison: URLs → pathname, screenshot
//     filenames lose their trailing timestamp (`0003_click_1781….png` → `0003_click.png`).

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

const VOLATILE_EVENTS = new Set(['mousemove', 'resize']);

// Keys dropped from every object, at any depth. (width/height survive — the
// only ones left after volatile events are dropped live in metadata.viewport
// and the initial navigation event, both deterministic at 1280x800.)
const VOLATILE_KEYS = new Set([
  // identifiers & timing
  'id', 'sessionId', 'baselineTestId', 'timestamp', 'createdAt', 'startedAt',
  'completedAt', 'recordingDuration',
  // environment / run target (the golden filename label pins the run instead)
  'userAgent', 'targetOrigin', 'sourceOrigin',
  // font/layout-dependent geometry
  'x', 'y', 'scrollX', 'scrollY', 'documentWidth', 'documentHeight', 'referrer', 'state',
  // exact diff magnitudes — only `passed` + `threshold` are stable across machines
  'pixelDifference', 'percentageDifference',
]);

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

// "/click" → "click", "/a/b" → "a_b", "/" → "root" — a filesystem-safe key.
function slugOf(url) {
  let p = pathOf(url).replace(/^\/+/, '').replace(/\/+$/, '');
  return p === '' ? 'root' : p.replace(/\//g, '_');
}

// Strip the trailing "_<epoch-ms>" a screenshot/diff filename carries.
function cleanString(key, v) {
  if (key === 'url') return pathOf(v);
  if (v.endsWith('.png')) return v.replace(/_\d{10,}\.png$/, '.png');
  return v;
}

// Recursive denylist clean. Object keys are sorted so the committed JSON has a
// stable shape (minimal git diffs); array order is preserved (it's meaningful
// and deterministic — event order, frame order).
function deepClean(value, key) {
  if (Array.isArray(value)) return value.map(v => deepClean(v));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (VOLATILE_KEYS.has(k)) continue;
      out[k] = deepClean(value[k], k);
    }
    return out;
  }
  if (typeof value === 'string') return cleanString(key, value);
  return value;
}

function runLabel(result, previewUrl, regressionUrl) {
  const t = result.targetOrigin;
  if (!t || t === result.sourceOrigin) return 'baseline';
  if (t === previewUrl) return 'preview';
  if (t === regressionUrl) return 'regression';
  return 'other';
}

/**
 * Read the live storage tree for a run and return a map of
 * { "<area>/<key>.json": cleanedObject } — one cleaned session per scenario
 * (keyed by URL path) and one cleaned result per replay (keyed by URL path +
 * run label). The same function feeds both writing the golden and comparing
 * against it, so the two can never drift.
 */
export function collectCleaned(dataDir, { projectId, previewUrl, regressionUrl }) {
  const base = join(dataDir, 'projects', projectId);
  const userDir = join(base, 'user-sessions');
  const testDir = join(base, 'test-sessions');
  const map = {};
  const sessionUrl = new Map(); // session uuid → recorded url (to key results)

  if (existsSync(userDir)) {
    for (const entry of readdirSync(userDir).sort()) {
      const p = join(userDir, entry, 'session.json');
      if (!existsSync(p)) continue;
      const session = JSON.parse(readFileSync(p, 'utf8'));
      sessionUrl.set(session.id, session.url);
      const events = (session.events ?? []).filter(e => e && !VOLATILE_EVENTS.has(e.type));
      map[`user-sessions/${slugOf(session.url)}.json`] = deepClean({ ...session, events });
    }
  }

  if (existsSync(testDir)) {
    for (const entry of readdirSync(testDir).sort()) {
      const p = join(testDir, entry, 'result.json');
      if (!existsSync(p)) continue;
      const result = JSON.parse(readFileSync(p, 'utf8'));
      const url = sessionUrl.get(result.sessionId);
      if (url == null) continue; // result for a session we didn't capture — skip
      const label = runLabel(result, previewUrl, regressionUrl);
      map[`test-sessions/${slugOf(url)}__${label}.json`] = deepClean(result);
    }
  }

  const sorted = {};
  for (const k of Object.keys(map).sort()) sorted[k] = map[k];
  return sorted;
}

// Persist a RAW golden: copy the session.json / result.json files verbatim,
// preserving the projects/<id>/<area>/<uuid>/ layout, so the committed tree is
// exactly what the run wrote (PNGs and pure index files omitted — the comparator
// validates frames from result.json, and never reads indexes). The golden root
// mirrors a data dir, so `collectCleaned(snapshotRoot, …)` reads it identically
// to a live run.
export function mirrorRawSnapshot(dataDir, root, { projectId }) {
  rmSync(root, { recursive: true, force: true });
  const srcBase = join(dataDir, 'projects', projectId);
  const dstBase = join(root, 'projects', projectId);
  for (const [area, file] of [
    ['user-sessions', 'session.json'],
    ['test-sessions', 'result.json'],
  ]) {
    const srcDir = join(srcBase, area);
    if (!existsSync(srcDir)) continue;
    for (const entry of readdirSync(srcDir)) {
      const src = join(srcDir, entry, file);
      if (!existsSync(src)) continue;
      const dest = join(dstBase, area, entry, file);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }
  }
}

// True if a golden has been committed under `root`.
export function hasSnapshot(root, projectId) {
  return existsSync(join(root, 'projects', projectId));
}

/**
 * Structural deep-compare of golden vs live (both normalized in-memory maps).
 * Returns human-readable mismatch strings keyed by file + field path
 * ("test-sessions/click__regression.json.diffs[0].passed: expected false, got
 * true"); empty array = match.
 */
export function compareSnapshots(expected, actual, path = '') {
  const diffs = [];
  const here = path || '(root)';

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) {
      diffs.push(`${here}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      return diffs;
    }
    expected.forEach((v, i) => diffs.push(...compareSnapshots(v, actual[i], `${path}[${i}]`)));
    return diffs;
  }

  if (expected !== null && actual !== null && typeof expected === 'object' && typeof actual === 'object') {
    for (const k of new Set([...Object.keys(expected), ...Object.keys(actual)]).values()) {
      const sub = path ? `${path}.${k}` : k;
      if (!(k in actual)) diffs.push(`${sub}: missing from this run`);
      else if (!(k in expected)) diffs.push(`${sub}: not in the committed snapshot (new — update the snapshot if intentional)`);
      else diffs.push(...compareSnapshots(expected[k], actual[k], sub));
    }
    return diffs;
  }

  if (expected !== actual) {
    diffs.push(`${here}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  return diffs;
}
