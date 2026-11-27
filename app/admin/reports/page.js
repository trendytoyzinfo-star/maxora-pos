import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { parseRange, fetchAll, istDay } from '@/lib/range';
import { inr } from '@/lib/format';
export const dynamic = 'force-dynamic';
const sum = (rows, f) => Math.round(rows.reduce((s, r) => s + Number(f(r) || 0), 0) * 100) / 100;
export default async function Page({ searchParams }) {
  await requireAdmin();
  const sp = await searchParams, r = parseRange(sp), db = admin();
  let orders = [], items = [], rets = [], failed = false;
  try {
    orders = await fetchAll(() => db.from('orders').select('id,created_at,status,payment_method,payment_status,subtotal,shipping_total,discount,total').gte('created_at', r.fromIso).lte('created_at', r.toIso).order('created_at').order('id'));
    const ids = orders.filter((o) => o.status !== 'cancelled').map((o) => o.id);
    for (let i = 0; i < ids.length; i += 150) {
      const part = ids.slice(i, i + 150);
      items.push(...await fetchAll(() => db.from('order_items').select('product_name,variant_name,quantity,line_total,is_free').in('order_id', part).order('id')));
    }
    rets = await fetchAll(() => db.from('return_claims').select('status,refund_amount').gte('created_at', r.fromIso).lte('created_at', r.toIso).order('created_at').order('id'));
  } catch (e) { console.error('report failed', e.message); failed = true; }

  const live = orders.filter((o) => o.status !== 'cancelled'), cancelled = orders.filter((o) => o.status === 'cancelled');
  const cod = live.filter((o) => o.payment_method === 'cod'), online = live.filter((o) => o.payment_method === 'online');
  const days = new Map();
  for (const o of live) { const d = istDay(o.created_at), x = days.get(d) || { n: 0, t: 0 }; x.n += 1; x.t += Number(o.total); days.set(d, x); }
  const prod = new Map();
  for (const i of items) { const k = i.product_name + (i.variant_name ? ` (${i.variant_name})` : ''), x = prod.get(k) || { q: 0, t: 0 }; x.q += i.quantity; x.t += i.is_free ? 0 : Number(i.line_total); prod.set(k, x); }
  const top = [...prod.entries()].sort((a, b) => b[1].q - a[1].q).slice(0, 10);
  const states = {}; for (const o of orders) states[o.status] = (states[o.status] || 0) + 1;
  const refunded = rets.filter((x) => x.status === 'refunded');
  const q = `from=${r.from}&to=${r.to}`;
  return (
    <div>
      <h1>Reports</h1>
      <form action="/admin/reports" className="two" style={{ alignItems: 'flex-end', maxWidth: 560 }}>
        <label>From<input type="date" name="from" defaultValue={r.from} /></label><label>To<input type="date" name="to" defaultValue={r.to} /></label>
        <button className="btn" type="submit" style={{ minHeight: 44 }}>Show</button></form>
      <div className="dl">
        <a className="btn ghost" href={`/admin/export?type=orders&${q}`}>Download orders (CSV)</a>
        <a className="btn ghost" href={`/admin/export?type=items&${q}`}>Download items sold (CSV)</a>
        <a className="btn ghost" href={`/admin/export?type=returns&${q}`}>Download returns (CSV)</a></div>
      {failed && <div className="bad">Could not load the report. Please try a shorter date range.</div>}
      <p className="muted">Dates are in Indian time. Counted by the day the order was placed. Cancelled orders are not counted as sales.</p>
      <div className="kpis">
        <div className="kpi"><span>Orders</span><b>{live.length}</b></div>
        <div className="kpi"><span>Sales (total)</span><b>{inr(sum(live, (o) => o.total))}</b></div>
        <div className="kpi"><span>Average order</span><b>{live.length ? inr(Math.round(sum(live, (o) => o.total) / live.length)) : '—'}</b></div>
        <div className="kpi"><span>Delivered sales</span><b>{inr(sum(live.filter((o) => o.status === 'delivered'), (o) => o.total))}</b></div>
        <div className="kpi"><span>Online (paid)</span><b>{inr(sum(online.filter((o) => o.payment_status === 'paid'), (o) => o.total))}</b></div>
        <div className="kpi"><span>COD orders</span><b>{cod.length} · {inr(sum(cod, (o) => o.total))}</b></div>
        <div className="kpi"><span>Discounts given</span><b>{inr(sum(live, (o) => o.discount))}</b></div>
        <div className="kpi"><span>Shipping charged</span><b>{inr(sum(live, (o) => o.shipping_total))}</b></div>
        <div className="kpi"><span>Cancelled</span><b>{cancelled.length} · {inr(sum(cancelled, (o) => o.total))}</b></div>
        <div className="kpi"><span>Returns / refunded</span><b>{rets.length} · {inr(sum(refunded, (x) => x.refund_amount))}</b></div>
      </div>
      <h2>Orders by status</h2>
      <p>{Object.keys(states).length ? Object.entries(states).map(([k, v]) => `${k}: ${v}`).join('  ·  ') : 'No orders in this period.'}</p>
      <h2>Day by day</h2>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Date</th><th>Orders</th><th>Sales</th></tr></thead><tbody>
        {[...days.entries()].sort().reverse().map(([d, x]) => <tr key={d}><td>{d}</td><td>{x.n}</td><td>{inr(x.t)}</td></tr>)}
        {!days.size && <tr><td colSpan={3} className="muted">No sales in this period.</td></tr>}</tbody></table></div>
      <h2>Top selling toys</h2>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Toy</th><th>Quantity</th><th>Sales</th></tr></thead><tbody>
        {top.map(([n, x]) => <tr key={n}><td>{n}</td><td>{x.q}</td><td>{inr(x.t)}</td></tr>)}
        {!top.length && <tr><td colSpan={3} className="muted">Nothing sold in this period.</td></tr>}</tbody></table></div>
    </div>
  );
}
