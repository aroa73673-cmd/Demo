/**
 * NEXUS BANK — in-memory sliding-window rate limiter.
 * Suitable for the single-node sandbox; production would use a shared store.
 * Keys are namespaced by bucket (e.g. "auth", "mutate") + client identity.
 */

type Bucket = { hits: number[]; };

const store = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of store) {
    if (bucket.hits.length === 0 || now - bucket.hits[bucket.hits.length - 1] > 15 * 60_000) {
      store.delete(key);
    }
  }
}

export type RateResult = { ok: boolean; remaining: number; retryAfterSec: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweep(now);
  const bucket = store.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    store.set(key, bucket);
    const oldest = bucket.hits[0];
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }
  bucket.hits.push(now);
  store.set(key, bucket);
  return { ok: true, remaining: limit - bucket.hits.length, retryAfterSec: 0 };
}

/** Fixed test hook: deterministic window reset (used by the automated test-suite). */
export function resetRateLimits(): void {
  store.clear();
}
