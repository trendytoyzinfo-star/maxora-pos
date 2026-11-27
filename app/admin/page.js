import Link from 'next/link';
import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { fetchAll, istDay, istToday } from '@/lib/range';
import { inr } from '@/lib/format';
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireAdmin(); const db = admin();
  const count = async (f) => { const { count: n } = await f(db.from('orders').select('id', { count: 'exact', head: true })); return n || 0; };
  const [placed, shipped, delivered, cancelled, all, toShip] = await Promise.all([
    count((q) => q.eq('status', 'placed')), count((q) => q.eq('status', 'shipped')), count((q) => q.eq('status', 'delivered')), count((q) => q.eq('status', 'cancelled')), count((q) => q),
    count((q) => q.in('status', ['placed', 'accepted', 'packed']).or('payment_method.eq.cod,payment_status.eq.paid')),
  ]);
  let orders = [], failed = false;
  try { orders = await fetchAll(() => db.from('orders').select('created_at,status,total').order('created_at').order('id')); } catch { failed = true; }
  const live = orders.filter((o) => o.status !== 'cancelled'), today = istToday();
  const days = [...Array(14)].map((_, i) => istDay(new Date(Date.now() - (13 - i) * 864e5).toISOString()));
  const byDay = Object.fromEntries(days.map((d) => [d, 0]));
  for (const o of live) { const d = istDay(o.created_at); if (d in byDay) byDay[d] += Number(o.total); }
  const max = Math.max(1, ...Object.values(byDay));
  const [{ data: prods }, { count: issues }, { count: openReturns }, { data: recent }] = await Promise.all([
    db.from('products').select('id,name,stock,variants').eq('status', 'active').limit(1000),
    db.from('payment_issues').select('id', { count: 'exact', head: true }).eq('resolved', false),
    db.from('return_claims').select('id', { count: 'exact', head: true }).in('status', ['requested', 'approved', 'received']),
    db.from('orders').select('id,order_number,customer_name,total,status,created_at').order('created_at', { ascending: false }).limit(6),
  ]);
  const { count: uncat } = await db.from('products').select('id', { count: 'exact', head: true }).is('category_id', null);
  const { data: st } = await db.from('store_settings').select('low_stock_threshold').eq('id', 1).maybeSingle(); const th = st?.low_stock_threshold ?? 5;
  const low = (prods || []).map((p) => { const vs = Array.isArray(p.variants) ? p.variants.filter((v) => v.is_active !== false) : []; const s = vs.length ? Math.min(...vs.map((v) => Number(v.stock) || 0)) : p.stock; return { id: p.id, name: p.name, s }; }).filter((p) => p.s <= th).sort((a, b) => a.s - b.s).slice(0, 8);
  const K = ({ t, v }) => <div className="kpi"><span>{t}</span><b>{v}</b></div>;
  return (
    <div><h1>Dashboard</h1>
      <div className="alerts">{issues > 0 && <Link href="/admin/payments">{issues} payment issue(s) need a refund</Link>}{openReturns > 0 && <Link href="/admin/returns">{openReturns} open return(s)</Link>}{uncat > 0 && <Link href="/admin/products?cat=none">{uncat} toys are Non-categorised</Link>}</div>
      {failed && <div className="bad">Could not load sales.</div>}
      <div className="kpis">
        <K t="Total sales (not cancelled)" v={inr(live.reduce((s, o) => s + Number(o.total), 0))} /><K t="Today's orders" v={live.filter((o) => istDay(o.created_at) === today).length} />
        <K t="To ship" v={toShip} /><K t="New (placed)" v={placed} /><K t="Shipped" v={shipped} /><K t="Delivered" v={delivered} /><K t="Cancelled" v={cancelled} /><K t="All orders" v={all} /></div>
      <h2>Sales, last 14 days</h2>
      <div className="chart"><svg viewBox="0 0 560 190" role="img" aria-label="Sales for the last 14 days">
        {days.map((d, i) => { const h = Math.round((byDay[d] / max) * 130); return <g key={d}><rect x={14 + i * 39} y={150 - h} width="28" height={Math.max(h, byDay[d] > 0 ? 2 : 0)} rx="4" fill="#4F46E5" /><text x={28 + i * 39} y="168" fontSize="9" textAnchor="middle" fill="#64748B">{d.slice(8)}/{d.slice(5, 7)}</text>{byDay[d] > 0 && <text x={28 + i * 39} y={144 - h} fontSize="9" textAnchor="middle" fill="#1B1F4B">{Math.round(byDay[d])}</text>}</g>; })}
        <line x1="8" y1="150" x2="552" y2="150" stroke="#E1E5F7" /></svg></div>
      <div className="two" style={{ marginTop: 16, alignItems: 'flex-start' }}>
        <div className="box"><h3 style={{ margin: 0 }}>Low stock ({th} or less)</h3>{low.length ? low.map((p) => <div key={p.id}><Link className="link" href={`/admin/products/${p.id}`}>{p.name}</Link> · <b>{p.s}</b> left</div>) : <div className="muted">All toys have enough stock.</div>}</div>
        <div className="box"><h3 style={{ margin: 0 }}>Latest orders</h3>{(recent || []).map((o) => <div key={o.id}><Link className="link" href={`/admin/orders/${o.id}`}>{o.order_number}</Link> · {o.customer_name} · {inr(o.total)} · {o.status}</div>)}{!recent?.length && <div className="muted">No orders yet.</div>}</div></div>
    </div>
  );
}
