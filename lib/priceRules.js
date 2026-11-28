// Timed price changes (Admin -> Offers -> Timed price change), applied when the store shows prices.
// The database function rule_price does the same sum at checkout and is the one that counts.
const whole = (n) => Math.round(n);   // prices are always whole rupees
export function pickRule(rules, productId, categoryId, now = Date.now()) {
  let best = null, bestRank = 9, bestAt = 0;
  for (const r of rules || []) {
    if (new Date(r.starts_at).getTime() > now || new Date(r.ends_at).getTime() < now) continue;
    const rank = r.scope === 'product' ? (r.product_id === productId ? 0 : 9) : r.scope === 'category' ? (categoryId && r.category_id === categoryId ? 1 : 9) : 2;
    if (rank === 9) continue;
    const at = new Date(r.created_at).getTime();
    if (rank < bestRank || (rank === bestRank && at > bestAt)) { best = r; bestRank = rank; bestAt = at; }
  }
  return best;
}
export function adjust(base, r) {
  const b = Number(base);
  const delta = r.mode === 'percent' ? whole((b * Number(r.value)) / 100) : whole(Number(r.value));
  return r.direction === 'increase' ? whole(b + delta) : Math.max(whole(b - delta), 1);
}
// Returns the product with its price (and option prices) changed. was_price keeps the normal price for the strike-through.
export function withRule(p, rules) {
  const r = pickRule(rules, p.id, p.category_id);
  if (!r) return p;
  const q = { ...p, price: adjust(p.price, r), was_price: Number(p.price), ruled: true };
  if (Array.isArray(p.variants)) q.variants = p.variants.map((v) => (v.price != null ? { ...v, price: adjust(v.price, r), was_price: Number(v.price) } : v));
  return q;
}
