/**
 * productImage — resolves the best image URL for a product card.
 *
 * Priority:
 *   1. Trust Amazon CDN URLs (m.media-amazon.com / amazon.in) — these
 *      hotlink reliably and look real.
 *   2. Otherwise generate one via Pollinations.ai — free image-gen
 *      service, no API key, returns the image directly via URL.
 *      Cached at their CDN so repeat loads are fast.
 *
 * Returns the URL string + a flag indicating whether it's the
 * generated fallback (so the card can show a small "AI image" marker
 * if we want).
 */

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt/";

const SPORT_HINT = {
  badminton: "badminton",
  tennis: "tennis",
  table_tennis: "table tennis",
  pickleball: "pickleball",
  cricket: "cricket",
  football: "football soccer",
  swimming: "swimming",
};

const CATEGORY_HINT = {
  rackets: "racket",
  tennis_rackets: "racket",
  paddles: "paddle",
  blades: "blade",
  rubbers: "rubber",
  ready_made_rackets: "table tennis racket",
  shoes: "court shoes",
  tennis_shoes: "tennis shoes",
  pb_shoes: "court shoes",
  cricket_shoes: "cricket shoes",
  football_boots: "football boots",
  bats: "cricket bat",
  balls: "ball",
  tennis_balls: "tennis balls",
  cricket_ball: "cricket ball",
  shuttlecocks: "shuttlecock",
  strings: "string",
  tennis_strings: "string",
  grips: "grip",
  goggles: "swim goggles",
  swimsuits: "swimsuit",
  pads: "pads",
  gloves: "gloves",
  helmets: "helmet",
};

function isAmazonCdn(url) {
  if (!url || typeof url !== "string") return false;
  return /m\.media-amazon\.com|amazon\.in/.test(url);
}

/**
 * @param {object} item — equipment item with name/brand/_sport/_category etc.
 * @param {object} opts — { width, height }
 * @returns {{ url: string, generated: boolean }}
 */
export function productImageFor(item, opts = {}) {
  const w = opts.width || 400;
  const h = opts.height || 400;
  const existing = item?.image;
  const failed = item?.image_search_failed;

  // Trust Amazon CDN images even without explicit verification.
  if (existing && !failed && isAmazonCdn(existing)) {
    return { url: existing, generated: false };
  }

  // Otherwise generate via Pollinations. Build a prompt from brand + name
  // + sport + category + "product photo white background" so the model
  // knows what we want.
  const sport = SPORT_HINT[item?._sport || item?.sport] || item?._sport || "";
  const category = CATEGORY_HINT[item?._category] || item?.type || "";
  const promptParts = [
    item?.brand || "",
    item?.name || "",
    sport,
    category,
    "product photo on white background, professional studio lighting, centered",
  ].filter(Boolean);
  const prompt = promptParts.join(" ");
  const url = `${POLLINATIONS_BASE}${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&model=flux`;
  return { url, generated: true };
}
