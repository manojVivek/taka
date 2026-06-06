export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatDate(timestamp: number | string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(timestamp: number | string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelativeTime(timestamp: number | string): string {
  const now = Date.now();
  const then = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(timestamp);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function getBrowserName(userAgent: string): string {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  return 'Unknown';
}

export function truncateId(id: string, length: number = 8): string {
  if (!id) return '';
  if (id.length <= length) return id;
  return id.slice(0, length);
}

/** The origin (`scheme://host[:port]`) of an absolute URL; falls back to the raw input. */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/** Compact origin label for filters/chips — drops the scheme (`https://x` → `x`). */
export function displayOrigin(origin: string): string {
  return origin.replace(/^https?:\/\//, '');
}

/**
 * Normalize a user-typed replay target into a bare origin, mirroring the API's
 * `normalizeOrigin` so the dialog can validate before submitting (and show the
 * cleaned value). Bare loopback hosts default to http://, everything else https://.
 */
export function normalizeOrigin(
  input: string,
): { ok: true; origin: string } | { ok: false; error: string } {
  const trimmed = (input || '').trim();
  if (!trimmed) return { ok: false, error: 'enter a target origin' };

  let candidate = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    let host = '';
    try {
      host = new URL(`http://${trimmed}`).hostname;
    } catch {
      host = '';
    }
    const loopback =
      host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
    candidate = `${loopback ? 'http' : 'https'}://${trimmed}`;
  }

  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { ok: false, error: 'not a valid URL or host' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: 'only http/https origins are supported' };
  }
  if (!u.hostname) return { ok: false, error: 'missing host' };
  return { ok: true, origin: u.origin };
}
