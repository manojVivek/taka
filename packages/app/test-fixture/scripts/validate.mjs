// Artifact-level validation for the e2e flow.
//
// The e2e's behavioral assertions (baseline created, preview passes, regression
// fails) trust the API's own reports. These validators independently verify the
// artifacts behind those claims, in three layers:
//
//   1. Shape      — required fields on the session / test-result JSON.
//   2. Artifacts  — the PNGs the run claims to have produced actually exist,
//                   are valid PNGs, share consistent dimensions, and the head
//                   run's frame set aligns 1:1 with the baseline's.
//   3. Visual     — an independent pixel probe: the regression run's final
//                   frame must actually contain the fixture's regression red
//                   (and the preview run's must not). This does not rely on
//                   the differ at all, so a differ that "passes everything"
//                   cannot fool it.
//
// Every validator returns [{ pass, label, detail? }] so the caller can feed
// them through the same assert helper as the behavioral checks.

import { inflateSync } from 'node:zlib';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function check(pass, label, detail) {
  return pass ? { pass, label } : { pass, label, detail };
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) return { status: res.status, buf: null };
  return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
}

// Minimal PNG header parse: magic + IHDR width/height. Enough to prove the
// blob is a real PNG of the expected size without decoding pixels.
function pngInfo(buf) {
  if (!buf || buf.length < 24) return null;
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// --- Layer 1: shape -----------------------------------------------------

export function validateSessionData(session) {
  const checks = [];
  checks.push(
    check(
      typeof session?.id === 'string' &&
        typeof session?.url === 'string' &&
        typeof session?.timestamp === 'number',
      'session JSON has required fields (id, url, timestamp)',
      { id: session?.id, url: session?.url, timestamp: session?.timestamp },
    ),
  );

  const events = session?.events ?? [];
  const malformed = events.filter(
    e => typeof e?.id !== 'string' || typeof e?.type !== 'string' || typeof e?.timestamp !== 'number',
  );
  checks.push(
    check(
      events.length > 0 && malformed.length === 0,
      `all ${events.length} events have required fields (id, type, timestamp)`,
      { malformed: malformed.slice(0, 3) },
    ),
  );

  const ids = new Set(events.map(e => e.id));
  checks.push(
    check(ids.size === events.length, 'event ids are unique (merge/dedup intact)', {
      events: events.length,
      uniqueIds: ids.size,
    }),
  );

  const meta = session?.metadata;
  checks.push(
    check(
      typeof meta?.userAgent === 'string' &&
        typeof meta?.viewport?.width === 'number' &&
        typeof meta?.viewport?.height === 'number',
      'session metadata has userAgent + viewport',
      meta,
    ),
  );

  const snap = session?.storageSnapshot;
  checks.push(
    check(
      snap != null &&
        typeof snap.localStorage === 'object' &&
        typeof snap.sessionStorage === 'object' &&
        typeof snap.cookies === 'object',
      'storage snapshot present (localStorage/sessionStorage/cookies)',
      snap == null ? 'missing' : Object.keys(snap),
    ),
  );

  checks.push(
    check(Array.isArray(session?.networkRequests), 'networkRequests is an array', typeof session?.networkRequests),
  );

  return checks;
}

function validateResultShape(result, { testId, sessionId }) {
  const checks = [];
  if (!result) {
    checks.push(check(false, 'test result JSON exists', 'result is null/undefined'));
    return checks;
  }
  checks.push(
    check(
      result.id === testId && result.sessionId === sessionId,
      'result identifies its test + session',
      { id: result.id, sessionId: result.sessionId },
    ),
  );
  checks.push(
    check(
      ['passed', 'failed'].includes(result.status) && typeof result.createdAt === 'number',
      `result has terminal status + createdAt (status=${result.status})`,
      { status: result.status, createdAt: result.createdAt },
    ),
  );
  const shots = result.screenshots ?? [];
  const badShots = shots.filter(
    s => typeof s?.path !== 'string' || !s.path.endsWith('.png') || typeof s?.eventIndex !== 'number',
  );
  checks.push(
    check(
      shots.length > 0 && badShots.length === 0,
      `result lists ${shots.length} screenshots with path + eventIndex`,
      { badShots: badShots.slice(0, 3) },
    ),
  );
  checks.push(check(Array.isArray(result.diffs), 'result.diffs is an array', typeof result.diffs));
  return checks;
}

// --- Layer 2: artifacts ---------------------------------------------------

async function validatePngSet(urls, label) {
  const checks = [];
  const dims = [];
  let fetched = 0;
  const problems = [];
  for (const url of urls) {
    const { status, buf } = await fetchBuffer(url);
    const info = pngInfo(buf);
    if (status !== 200 || !info) {
      problems.push({ url: url.split('/').pop(), status, validPng: !!info });
      continue;
    }
    fetched++;
    dims.push(info);
  }
  checks.push(
    check(
      fetched === urls.length && urls.length > 0,
      `${label}: all ${urls.length} PNG blobs fetch as valid PNGs`,
      { fetched, expected: urls.length, problems: problems.slice(0, 3) },
    ),
  );
  const first = dims[0];
  const inconsistent = dims.filter(d => d.width !== first?.width || d.height !== first?.height);
  checks.push(
    check(
      dims.length > 0 && inconsistent.length === 0,
      `${label}: frames share one resolution (${first?.width}×${first?.height})`,
      { first, inconsistent: inconsistent.slice(0, 3) },
    ),
  );
  return { checks, dims: first ?? null };
}

/**
 * Validate the baseline run end to end: session flagged, file listing matches
 * the result's claim, every PNG is real. Returns the frame count + dimensions
 * so comparison runs can be validated against them.
 */
export async function validateBaselineRun({ apiBase, projectId, sessionId, testId, result }) {
  const checks = validateResultShape(result, { testId, sessionId });
  if (!result) return { checks, frameCount: 0, dims: null };

  // The session must now be flagged AND have real files behind the flag.
  const sessionRes = await fetch(`${apiBase}/projects/${projectId}/sessions/${sessionId}`);
  const session = sessionRes.ok ? await sessionRes.json() : null;
  checks.push(
    check(
      session?.hasBaseline === true && session?.baselineTestId === testId,
      'session flagged with hasBaseline + baselineTestId',
      { hasBaseline: session?.hasBaseline, baselineTestId: session?.baselineTestId, expected: testId },
    ),
  );

  const listRes = await fetch(`${apiBase}/projects/${projectId}/sessions/${sessionId}/screenshots`);
  const listing = listRes.ok ? await listRes.json() : null;
  const listed = listing?.screenshots ?? [];
  checks.push(
    check(
      listed.length > 0 && listed.length === result.screenshots.length,
      `baseline file listing matches result claim (${listed.length} frames)`,
      { listed: listed.length, claimed: result.screenshots.length },
    ),
  );

  const urls = listed.map(
    s => `${apiBase}/projects/${projectId}/user-sessions/${sessionId}/screenshots/${s.filename}`,
  );
  const pngs = await validatePngSet(urls, 'baseline artifacts');
  checks.push(...pngs.checks);

  return { checks, frameCount: listed.length, dims: pngs.dims };
}

/**
 * Validate a comparison (head) run against the established baseline: frame set
 * aligns 1:1, PNGs are real and same-resolution, and the diff report on disk
 * is internally consistent with the run's verdict. `expectFailures` flips the
 * report expectation between the preview (0 failed) and regression (≥1 failed)
 * runs; failing entries must have a fetchable diff image.
 */
export async function validateComparisonRun({
  apiBase,
  projectId,
  testId,
  sessionId,
  result,
  baseline,
  expectFailures,
}) {
  const checks = validateResultShape(result, { testId, sessionId });
  if (!result) return checks;

  checks.push(
    check(!result.isBaseline, 'comparison run is not marked as a baseline', { isBaseline: result.isBaseline }),
  );
  checks.push(
    check(
      result.screenshots.length === baseline.frameCount,
      `head frame count matches baseline (${result.screenshots.length}/${baseline.frameCount})`,
      { head: result.screenshots.length, baseline: baseline.frameCount },
    ),
  );
  checks.push(
    check(
      (result.diffs ?? []).length === baseline.frameCount,
      `every baseline frame was compared (${(result.diffs ?? []).length} diffs)`,
      { diffs: (result.diffs ?? []).length, baseline: baseline.frameCount },
    ),
  );

  const urls = result.screenshots.map(
    s => `${apiBase}/projects/${projectId}/test-sessions/${testId}/screenshots/${s.path}`,
  );
  const pngs = await validatePngSet(urls, 'head artifacts');
  checks.push(...pngs.checks);
  if (pngs.dims && baseline.dims) {
    checks.push(
      check(
        pngs.dims.width === baseline.dims.width && pngs.dims.height === baseline.dims.height,
        'head resolution matches baseline resolution',
        { head: pngs.dims, baseline: baseline.dims },
      ),
    );
  }

  // The diff report persisted next to the diff images must agree with the run.
  const { status: repStatus, buf: repBuf } = await fetchBuffer(
    `${apiBase}/projects/${projectId}/test-sessions/${testId}/diffs/report.json`,
  );
  let report = null;
  try {
    report = repStatus === 200 && repBuf ? JSON.parse(repBuf.toString('utf8')) : null;
  } catch {
    report = null;
  }
  checks.push(check(report != null, 'diff report.json exists and parses', { status: repStatus }));

  if (report) {
    const { total, passed, failed } = report.summary ?? {};
    checks.push(
      check(
        total === baseline.frameCount && passed + failed === total,
        `diff report is internally consistent (${passed} passed + ${failed} failed = ${total})`,
        report.summary,
      ),
    );
    checks.push(
      check(
        expectFailures ? failed >= 1 : failed === 0,
        expectFailures
          ? `diff report records the regression (${failed} failed frames)`
          : 'diff report records zero failures for the preview run',
        report.summary,
      ),
    );

    const failing = (report.diffs ?? []).filter(d => !d.passed);
    const missingFilename = failing.filter(d => !d.diffFilename);
    checks.push(
      check(
        missingFilename.length === 0,
        'every failing frame names its diff image',
        { missing: missingFilename.slice(0, 3) },
      ),
    );
    if (failing.length > 0 && missingFilename.length === 0) {
      const diffUrls = failing.map(
        d => `${apiBase}/projects/${projectId}/test-sessions/${testId}/diffs/${d.diffFilename}`,
      );
      const diffPngs = await validatePngSet(diffUrls, 'diff images');
      checks.push(...diffPngs.checks);
    }
  }

  return checks;
}

// --- Layer 3: independent visual probe -------------------------------------

// Minimal PNG decoder for Chrome screenshots: 8-bit RGB/RGBA, non-interlaced
// (exactly what page.screenshot() emits). Pure Node (zlib) — deliberately no
// browser involvement, because in-browser image loading proved unreliable
// while the parallel e2e keeps Chromium's decode pipeline busy.
function decodePng(buf) {
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') {
      const d = buf.subarray(off + 8, off + 8 + len);
      width = d.readUInt32BE(0);
      height = d.readUInt32BE(4);
      bitDepth = d[8];
      colorType = d[9];
      interlace = d[12];
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(off + 8, off + 8 + len));
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len; // length + type + payload-crc
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(`unsupported PNG layout (depth=${bitDepth} color=${colorType} interlace=${interlace})`);
  }
  const bpp = colorType === 6 ? 4 : 3; // RGBA : RGB
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  let prev = null;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const cur = out.subarray(y * stride, (y + 1) * stride);
    raw.copy(cur, 0, pos, pos + stride);
    pos += stride;
    switch (filter) {
      case 0:
        break;
      case 1: // Sub
        for (let i = bpp; i < stride; i++) cur[i] = (cur[i] + cur[i - bpp]) & 0xff;
        break;
      case 2: // Up
        if (prev) for (let i = 0; i < stride; i++) cur[i] = (cur[i] + prev[i]) & 0xff;
        break;
      case 3: // Average
        for (let i = 0; i < stride; i++) {
          const left = i >= bpp ? cur[i - bpp] : 0;
          const up = prev ? prev[i] : 0;
          cur[i] = (cur[i] + ((left + up) >> 1)) & 0xff;
        }
        break;
      case 4: // Paeth
        for (let i = 0; i < stride; i++) {
          const a = i >= bpp ? cur[i - bpp] : 0;
          const b = prev ? prev[i] : 0;
          const c = prev && i >= bpp ? prev[i - bpp] : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          cur[i] = (cur[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
        }
        break;
      default:
        throw new Error(`unsupported PNG filter ${filter}`);
    }
    prev = cur;
  }
  return { width, height, bpp, data: out };
}

/**
 * Fetch a screenshot and return the fraction of its pixels matching the
 * fixtures' regression red (#ff0033). Decoded entirely in Node — independent
 * of both the differ and any browser, so it proves the replay actually
 * rendered the origin it claims to have rendered.
 */
export async function measureRedRatio(imageUrl) {
  const { status, buf } = await fetchBuffer(imageUrl);
  if (status !== 200) throw new Error(`screenshot fetch returned ${status}`);
  if (!pngInfo(buf)) throw new Error('screenshot blob is not a valid PNG');
  const { width, height, bpp, data } = decodePng(buf);
  let red = 0;
  for (let i = 0; i < data.length; i += bpp) {
    if (data[i] > 180 && data[i + 1] < 90 && data[i + 2] < 120) red++;
  }
  return red / (width * height);
}
