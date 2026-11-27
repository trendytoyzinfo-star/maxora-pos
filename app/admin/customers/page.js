import Link from 'next/link';
import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { fetchAll } from '@/lib/range';
import { inr } from '@/lib/format';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams, db = admin();
  const term = (typeof sp.q === 'string' ? sp.q : '').toLowerCase().trim().slice(0, 40);
  let orders = [], failed = false;
  try { orders = await fetchAll(() => db.from('orders').select('customer_name,customer_phone,customer_email,total,status,created_at').order('created_at').order('id')); } catch { failed = true; }
  const map = new Map();
  for (const o of orders) {   // customers are grouped by mobile number (guest checkout)
    const c = map.get(o.customer_phone) || { phone: o.customer_phone, orders: 0, spent: 0, last: o.created_at };
    c.name = o.customer_name; if (o.customer_email) c.email = o.customer_email; c.last = o.created_at;
    if (o.status !== 'cancelled') { c.orders += 1; c.spent += Number(o.total); }
    map.set(o.customer_phone, c);
  }
  const rows = [...map.values()].filter((c) => !term || `${c.name} ${c.phone} ${c.email || ''}`.toLowerCase().includes(term)).sort((a, b) => (a.last < b.last ? 1 : -1)).slice(0, 300);
  return (
    <div><h1>Customers</h1>
      <form action="/admin/customers" className="two" style={{ alignItems: 'flex-end', maxWidth: 520 }}><label>Search name, email or phone<input name="q" defaultValue={term} /></label><button className="btn" type="submit" style={{ minHeight: 44 }}>Search</button></form>
      <div className="dl"><a className="btn ghost" href="/admin/export?type=customers">Download customers (CSV)</a></div>
      {failed && <div className="bad">Could not load customers.</div>}
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Spent</th><th>Last order</th></tr></thead><tbody>
        {rows.map((c) => <tr key={c.phone}><td><b>{c.name}</b></td><td>{c.phone}{c.email && <div className="muted">{c.email}</div>}</td><td>{c.orders}</td><td>{inr(c.spent)}</td><td>{new Date(c.last).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</td></tr>)}
        {!rows.length && <tr><td colSpan={5} className="muted">No customers yet.</td></tr>}</tbody></table></div>
      <p className="muted">Total spent does not include cancelled orders. <Link className="link" href="/admin/orders">See all orders</Link></p></div>
  );
}
