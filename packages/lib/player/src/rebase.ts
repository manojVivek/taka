/**
 * Rebase a recorded URL onto a target origin for preview-environment replay.
 *
 * A recorded session is pinned to the origin it was captured on (the *source*
 * origin, derived per-session from `sessionData.url`). To replay it against a
 * different deployment — a Vercel-style preview, a staging box, the user's
 * local dev — we swap any URL whose origin matches the source onto the
 * `targetOrigin`, and leave cross-origin URLs (CDNs, third-party APIs,
 * analytics, a separate API origin) exactly as recorded.
 *
 *   - No `targetOrigin`, or it equals the source → identity (replay on the
 *     recorded origin; current behavior, fully backward compatible).
 *   - Relative recorded URLs are resolved against `sourceOrigin` first, so they
 *     rebase too.
 *   - Unparseable input is returned unchanged (best-effort; never throws).
 *
 * @param url           a recorded URL (absolute, or relative to the source origin)
 * @param sourceOrigin  the recording origin, e.g. `new URL(sessionData.url).origin`
 * @param targetOrigin  the origin to replay against (a normalized origin like
 *                       `https://preview.example.com`); falsy → identity
 */
export function rebaseUrl(
  url: string,
  sourceOrigin: string,
  targetOrigin?: string,
): string {
  if (!targetOrigin || targetOrigin === sourceOrigin) {
    return url;
  }

  let resolved: URL;
  try {
    // Resolve against the source origin so relative recorded URLs become absolute.
    resolved = new URL(url, sourceOrigin);
  } catch {
    return url;
  }

  if (resolved.origin !== sourceOrigin) {
    // Cross-origin (CDN, third-party API, separate API origin) — leave as recorded.
    return url;
  }

  let target: URL;
  try {
    target = new URL(targetOrigin);
  } catch {
    return url;
  }

  // Swap scheme + host (+ port) onto the target; preserve path, query, and hash.
  resolved.protocol = target.protocol;
  resolved.host = target.host; // `host` carries the port when present
  return resolved.href;
}

/**
 * The hostname a rebased session's cookies should be scoped to: the target's
 * hostname when replaying against a preview, otherwise the source's. Used to
 * re-scope restored auth cookies so they apply on the replay origin.
 */
export function rebaseHostname(sourceOrigin: string, targetOrigin?: string): string {
  const origin = targetOrigin || sourceOrigin;
  try {
    return new URL(origin).hostname;
  } catch {
    // Fall back to the source hostname if the target was somehow unparseable.
    return new URL(sourceOrigin).hostname;
  }
}
