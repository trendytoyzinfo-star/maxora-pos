// Works out what an order will cost, from the database (never from the browser's prices).
// The prices, the timed price changes and the ONE best offer are worked out by the database function
// price_cart (supabase/06_offers_email_site.sql). The very same function is used by create_order for the final price.
// Here we only add the friendly checks: stock, options, cash on delivery.
import { withRule } from '@/lib/priceRules';
const money = (n) => Math.round(Number(n) * 100) / 100;
const k3 = (p, v, f) => p + '|' + (v || '') + '|' + (f ? 'f' : 'p');

export async function quote(db, items, couponCode, who = {}) {
  const ids = [...new Set(items.map((i) => i.product_id))];
  const code = (couponCode || '').toString().trim().toUpperCase().slice(0, 40);
  const [{ data: prods, error: e1 }, { data: settings, error: e2 }, { data: pc, error: e3 }] = await Promise.all([
    db.from('products').select('id,name,slug,stock,cod_enabled,variants,status,product_images(storage_path,sort_order)').in('id', ids),
    db.from('store_settings').select('cod_enabled').eq('id', 1).maybeSingle(),
    db.rpc('price_cart', { p_items: items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id || '', quantity: i.quantity, free: !!i.free })), p_coupon: code, p_user: who.userId || null, p_phone: who.phone || null }),
  ]);
  if (e3) { console.error('price_cart failed', e3.message); throw new Error('Prices are not ready. Run supabase/06_offers_email_site.sql in Supabase first.'); }
  if (e1 || e2) throw new Error('Could not read prices');
  const byId = new Map((prods || []).map((p) => [p.id, p]));
  const priced = new Map((pc.lines || []).map((l) => [k3(l.product_id, l.variant_id, l.is_free), l]));

  const problems = [];
  const need = new Map();   // the same toy can be in the cart twice (paid + free): stock must cover both
  for (const it of items) { const k = it.product_id + '|' + (it.variant_id || ''); need.set(k, (need.get(k) || 0) + it.quantity); }
  let codOk = !!settings?.cod_enabled;
  const lines = items.map((it) => {
    const p = byId.get(it.product_id);
    const line = { product_id: it.product_id, variant_id: it.variant_id, quantity: it.quantity, free: !!it.free, ok: false };
    if (!p || p.status !== 'active') { line.name = 'This item'; line.problem = 'No longer available'; problems.push('An item in your cart is no longer available.'); return line; }
    line.name = p.name; line.slug = p.slug;
    line.image = [...(p.product_images || [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path || null;
    let stock = p.stock;
    if (it.variant_id) {
      const v = (p.variants || []).find((x) => x.id === it.variant_id && x.is_active !== false);
      if (!v) { line.problem = 'This option is no longer available'; problems.push(`${p.name}: this option is no longer available.`); return line; }
      stock = Number(v.stock); line.variant_name = v.name;
    }
    const pr = priced.get(k3(it.product_id, it.variant_id, it.free));
    if (!pr) { line.problem = 'No longer available'; problems.push(`${p.name}: price is not available.`); return line; }
    line.unit_price = Number(pr.unit_price); line.stock = stock; line.line_total = money(pr.unit_price * it.quantity);
    if (pr.ruled) line.was_price = Number(pr.base_price);
    const want = need.get(it.product_id + '|' + (it.variant_id || '')) || it.quantity;
    if (stock < want) { line.problem = stock > 0 ? `Only ${stock} left` : 'Sold out'; problems.push(`${p.name}${line.variant_name ? ` (${line.variant_name})` : ''}: ${stock > 0 ? `only ${stock} left` : 'sold out'}.`); return line; }
    line.ok = true;
    if (!p.cod_enabled) codOk = false;
    return line;
  });

  // default free toys (same toy as bought) added by the database when the customer did not choose all his free toys
  for (const a of (pc.lines || []).filter((l) => l.auto)) {
    const p = byId.get(a.product_id); if (!p) continue;
    const v = a.variant_id ? (p.variants || []).find((x) => x.id === a.variant_id) : null;
    lines.push({ product_id: a.product_id, variant_id: a.variant_id || '', quantity: Number(a.qty), free: true, auto: true, ok: true, name: p.name, slug: p.slug, variant_name: v?.name || '',
      image: [...(p.product_images || [])].sort((x, y) => x.sort_order - y.sort_order)[0]?.storage_path || null, unit_price: Number(a.unit_price), line_total: money(a.unit_price * a.qty) });
  }

  // free toys the customer may pick (only the display list; the database checks the choice again at checkout)
  let claim = null;
  if (pc.claim) {
    const c = pc.claim, paidIds = new Set((pc.lines || []).filter((l) => !l.is_free).map((l) => l.product_id));
    const left = Math.max(0, money(Number(c.budget) - Number(c.spent)));
    const inCart = new Map(); for (const l of pc.lines || []) { const k = l.product_id + '|' + (l.variant_id || ''); inCart.set(k, (inCart.get(k) || 0) + Number(l.qty)); }
    let qy = db.from('products').select('id,name,slug,price,stock,variants,category_id,product_images(storage_path,sort_order)').eq('status', 'active').limit(400);
    if (c.scope === 'category') qy = qy.eq('category_id', c.category_id); else if (c.scope === 'product') qy = qy.eq('id', c.product_id);
    const [{ data: cand }, { data: rules }] = await Promise.all([qy, db.from('price_rules').select('id,scope,category_id,product_id,direction,mode,value,starts_at,ends_at,created_at').eq('is_active', true)]);
    const options = [];
    for (const raw of cand || []) {
      const p = withRule(raw, rules || []), same = paidIds.has(p.id);
      const img = [...(p.product_images || [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path || null;
      const vs = (p.variants || []).filter((v) => v.is_active !== false);
      const entries = vs.length ? vs.map((v) => ({ variant_id: v.id, variant_name: v.name, price: Number(v.price ?? p.price), stock: Number(v.stock) })) : [{ variant_id: '', variant_name: '', price: Number(p.price), stock: Number(p.stock) }];
      for (const e of entries) if (e.stock - (inCart.get(p.id + '|' + e.variant_id) || 0) > 0 && (same || e.price <= left + 0.005)) options.push({ product_id: p.id, slug: p.slug, name: p.name, image: img, same, ...e });
    }
    options.sort((a, b) => (b.same - a.same) || b.price - a.price);
    claim = { deal: c.deal_name, allowed: c.allowed, chosen: c.chosen, auto: Number(c.auto || 0), left, pct: c.pct, options: options.slice(0, 60) };
  }
  if (pc.free_ok === false) problems.push(pc.free_msg || 'Your free toy choice is not valid. Please choose again.');

  const subtotal = money(pc.subtotal), shipping = money(pc.shipping), discount = money(pc.discount);
  const freeAbove = pc.free_shipping_above == null ? null : Number(pc.free_shipping_above);
  const coupon = pc.offer_kind === 'coupon' ? { code: pc.offer_code, description: null } : null;
  return {
    lines, problems, subtotal, shipping, discount, total: money(subtotal + shipping - discount),
    coupon, couponError: pc.coupon_error || null, codAvailable: codOk, freeShippingAbove: freeAbove,
    offer: pc.offer_kind ? { kind: pc.offer_kind, label: pc.offer_label } : null, notice: pc.notice || null,
    claim, freeInvalid: pc.free_ok === false, freeMsg: pc.free_msg || null,
  };
}
