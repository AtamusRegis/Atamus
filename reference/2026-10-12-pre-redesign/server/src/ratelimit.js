// Tiny in-memory rate limiter. Good enough for one server process.
// Keyed by (bucket + client ip). Not shared across restarts, which is fine.

const hits = new Map();

/**
 * Returns true if the request is allowed, false if it should be blocked.
 * @param {string} bucket  logical action, e.g. "login"
 * @param {string} ip      client ip
 * @param {number} max     max attempts within the window
 * @param {number} windowMs
 */
export function allow(bucket, ip, max, windowMs) {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}

// Occasionally drop stale entries so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
}, 60_000).unref();
