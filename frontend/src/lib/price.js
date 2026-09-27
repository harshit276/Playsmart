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

// When the card is charged in a different currency from the quote (a dollar
// price billed in rupees before International Payments is on), say so up
// front — a different number appearing at checkout is where people abandon.
export function formatChargeNote(pack) {
  if (!pack?.charge_currency || !pack.currency || pack.charge_currency === pack.currency) return "";
  const amt = Number(pack.charge_amount);
  if (!Number.isFinite(amt)) return "";
  const shown = pack.charge_currency === "INR" ? "₹" + amt.toLocaleString("en-IN") : "$" + amt;
  return `billed as ${shown}`;
}
