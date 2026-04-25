/**
 * Affiliate-link rewriter. Append our Amazon Associates tag to any
 * amazon.in URL so we earn commission on qualifying sales.
 *
 * Reads the tag from REACT_APP_AMAZON_AFFILIATE_TAG with a hardcoded
 * fallback so the build always has one. Affiliate tags are public —
 * they appear in the URL the user clicks — so it's safe to ship.
 *
 * Works for both product URLs and search URLs:
 *   amazon.in/dp/B0B... → adds ?tag=…
 *   amazon.in/s?k=Yonex → adds &tag=…
 */
const AMAZON_AFFILIATE_TAG =
  (typeof process !== "undefined" &&
    process?.env?.REACT_APP_AMAZON_AFFILIATE_TAG) ||
  "harshit123077-21";

const AMAZON_HOSTS = ["amazon.in", "amzn.in", "amazon.com"];

export function withAffiliate(url) {
  if (!url || typeof url !== "string") return url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!AMAZON_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return url;
  }
  // Don't override an already-present tag (e.g. a partner's link).
  if (!parsed.searchParams.has("tag")) {
    parsed.searchParams.set("tag", AMAZON_AFFILIATE_TAG);
  }
  return parsed.toString();
}

/** Same as withAffiliate but maps over a buy_links object. */
export function rewriteBuyLinks(buyLinks) {
  if (!buyLinks || typeof buyLinks !== "object") return buyLinks;
  const out = {};
  for (const [k, v] of Object.entries(buyLinks)) {
    if (typeof v === "string") out[k] = withAffiliate(v);
    else out[k] = v;
  }
  return out;
}
