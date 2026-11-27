export const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
export const off = (p, m) => (m && m > p ? Math.round(((m - p) / m) * 100) : 0);
// Struck-through price and % off. A running price change shows the normal price as the struck price.
export const deal = (price, mrp, was) => { const hi = Math.max(Number(mrp) || 0, Number(was) || 0); return hi > price ? { strike: hi, pct: Math.round(((hi - price) / hi) * 100) } : { strike: 0, pct: 0 }; };
export const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://trendytoyz.in';
