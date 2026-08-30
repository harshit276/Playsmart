// Render a pack price in whatever currency the backend resolved for this
// visitor (see _packs_for on the server: India -> INR, elsewhere -> USD).
// Falls back to the rupee price so an older cached payload still renders.
export function formatPackPrice(pack) {
  if (!pack) return "";
  const cur = pack.currency || "INR";
  const amount = pack.price != null ? pack.price : pack.price_inr;
  if (amount == null) return "";
  return cur === "USD" ? "$" + amount : "₹" + amount;
}
