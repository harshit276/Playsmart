/**
 * Stale-while-revalidate cache for `api.get` calls.
 *
 * Usage:
 *   const { cached, fresh } = swrGet("/recommendations/equipment/...");
 *   if (cached) setData(cached);          // instant render
 *   fresh.then((d) => setData(d));        // background refresh
 *
 * - Memory cache (lifetime of the JS bundle: tab session).
 * - sessionStorage fallback (survives soft refresh / tab navigation).
 * - 24h TTL on stored entries.
 *
 * No need to invalidate per-route; cache key is the full URL incl. query.
 */
import api from "./api";

const TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = "swr_";
const memCache = new Map();

function readSession(key) {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    if (Date.now() - (obj.ts || 0) > TTL_MS) return null;
    return obj.data;
  } catch {
    return null;
  }
}

function writeSession(key, data) {
  try {
    sessionStorage.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify({ data, ts: Date.now() }),
    );
  } catch {
    // Storage full or disabled — silently skip.
  }
}

/**
 * Look up the cached value for a url (no network call). Used by callers that
 * want to short-circuit a render path.
 */
export function getCached(url) {
  if (memCache.has(url)) return memCache.get(url);
  const fromSession = readSession(url);
  if (fromSession != null) memCache.set(url, fromSession);
  return fromSession;
}

/**
 * Stale-while-revalidate fetch. Returns:
 *   - cached: the cached payload (or null if first visit)
 *   - fresh:  Promise<freshData> that resolves once the network call returns
 */
export function swrGet(url, options = {}) {
  const cached = getCached(url);
  const fresh = api.get(url, options).then((res) => {
    memCache.set(url, res.data);
    writeSession(url, res.data);
    return res.data;
  });
  return { cached, fresh };
}

/**
 * Manually purge a cache entry — call after a mutation that invalidates
 * downstream reads (e.g. saving a profile change before re-loading recs).
 */
export function invalidate(url) {
  memCache.delete(url);
  try { sessionStorage.removeItem(STORAGE_PREFIX + url); } catch {}
}

/**
 * Purge every entry whose key matches the predicate. Useful for cache busts
 * keyed by user_id or sport.
 */
export function invalidateMatching(pred) {
  for (const k of memCache.keys()) if (pred(k)) memCache.delete(k);
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX) && pred(k.slice(STORAGE_PREFIX.length))) {
        keys.push(k);
      }
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}
