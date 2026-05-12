/**
 * productImage — resolves the best image URL for a product card.
 *
 * Honest scope:
 *   • If the item has a usable image URL (Amazon CDN, Flipkart CDN,
 *     official brand site), let the browser try to load it. Most
 *     existing data has Flipkart `rukminim2.flixcart.com` URLs that
 *     sometimes 404 — the card swaps to the placeholder on error.
 *   • If no image at all, return null so the card renders the rich
 *     brand-name placeholder instead. We tried AI generation via
 *     Pollinations earlier — too slow + irrelevant for branded
 *     products — so we don't go down that road anymore.
 *
 * Returns: { url: string|null, generated: false }
 * `generated` is kept in the contract for backward-compat with cards
 * that show an "AI" badge — always false now.
 */

/**
 * @param {object} item — equipment item with name/brand/image etc.
 * @returns {{ url: string|null, generated: false }}
 */
export function productImageFor(item /*, opts */) {
  const existing = item?.image_url || item?.image;
  // If the item carries any URL, hand it back. The card's <img> onError
  // will fall through to the branded placeholder on broken links.
  // We previously tried to drop non-Amazon URLs sight-unseen — that was
  // overkill, plenty of Flipkart URLs do load.
  if (existing && typeof existing === "string" && existing.startsWith("http")) {
    return { url: existing, generated: false };
  }
  return { url: null, generated: false };
}
