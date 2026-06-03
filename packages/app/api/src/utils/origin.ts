// Normalization for a user-supplied replay *target origin*. A session can be
// replayed against an arbitrary deployment (a Vercel-style preview, staging,
// local dev); the UI/API accept a loosely-typed value and we normalize it to a
// bare origin (`scheme://host[:port]`, no path/query/hash) before it reaches
// the player. Invalid values are rejected so the caller can return a 400.

export type NormalizeOriginResult =
  | { ok: true; origin: string }
  | { ok: false; error: string };

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

/**
 * Normalize a replay target into a bare origin.
 *
 *   - Full URL (`https://preview.example.com/foo?x=1`) → its origin
 *     (`https://preview.example.com`); any path/query/hash is dropped.
 *   - Bare host (`preview.example.com`, `localhost:3004`) → a scheme is assumed:
 *     `http://` for loopback hosts (so `localhost:3004` matches a dev server),
 *     `https://` otherwise.
 *   - Non-http(s) schemes, hostless, or unparseable input → `{ ok: false }`.
 */
export function normalizeOrigin(input: string): NormalizeOriginResult {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'origin is empty' };
  }

  let candidate = trimmed;
  if (!SCHEME_RE.test(trimmed)) {
    // Bare host — peek at the hostname to pick a sensible default scheme.
    let host = '';
    try {
      host = new URL(`http://${trimmed}`).hostname;
    } catch {
      host = '';
    }
    candidate = `${isLoopbackHost(host) ? 'http' : 'https'}://${trimmed}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: `not a valid URL or host: "${trimmed}"` };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: `unsupported scheme "${url.protocol}" (only http/https)` };
  }
  if (!url.hostname) {
    return { ok: false, error: `missing host in "${trimmed}"` };
  }

  return { ok: true, origin: url.origin };
}
