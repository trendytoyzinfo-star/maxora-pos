import Link from 'next/link';
import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { inr } from '@/lib/format';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';
import { advanceOrder, cancelOrder, checkTracking } from '../actions';
import { CANCEL_REASONS } from '@/lib/returnPolicy';
import SeenMarker from '@/components/SeenMarker';
const TABS = ['all', 'placed', 'accepted', 'packed', 'shipped', 'delivered', 'cancelled'];
export default async function Page({ searchParams }) {
  await requireAdmin();
  const sp = await searchParams, st = TABS.includes(sp.status) ? sp.status : 'all';
  const term = (typeof sp.q === 'string' ? sp.q : '').replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 30);
  let q = admin().from('orders').select('id,order_number,created_at,customer_name,customer_phone,total,status,payment_method,payment_status,courier_name,awb_number,seen_at').order('created_at', { ascending: false }).limit(200);
  if (st !== 'all') q = q.eq('status', st);
  if (term) q = q.or(`order_number.ilike.%${term}%,customer_phone.ilike.%${term}%,customer_name.ilike.%${term}%,awb_number.ilike.%${term}%`);
  const { data: rows, error } = await q;
  const isReal = (o) => o.payment_method === 'cod' || o.payment_status === 'paid';
  const unseen = (rows || []).filter((o) => !o.seen_at && isReal(o) && o.status !== 'cancelled').map((o) => o.id);
  return (
    <div><SeenMarker kind="orders" ids={unseen} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}><h1>Orders</h1><form action={checkTracking}><button className="btn ghost" type="submit">Check delivery updates</button></form></div><Flash sp={sp} />
      <div className="pills">{TABS.map((t) => <Link key={t} href={`/admin/orders?status=${t}`} className={'pill' + (t === st ? ' on' : '')}>{t}</Link>)}</div>
      <form action="/admin/orders" className="two" style={{ margin: '10px 0', maxWidth: 520 }}><input type="hidden" name="status" value={st} /><label>Search by order no, name, phone or AWB<input name="q" defaultValue={term} /></label></form>
      {error && <div className="bad">Could not load orders.</div>}
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Courier</th><th>Action</th></tr></thead><tbody>
        {(rows || []).map((o) => <tr key={o.id}>
          <td><Link className="link" href={`/admin/orders/${o.id}`}>{o.order_number}</Link>{!o.seen_at && isReal(o) && o.status !== 'cancelled' && <> <span className="tag newtag">NEW</span></>}</td>
          <td>{new Date(o.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</td>
          <td>{o.customer_name}<div className="muted">{o.customer_phone}</div></td><td>{inr(o.total)}</td>
          <td>{o.payment_method === 'cod' ? 'COD' : 'Online'} · {o.payment_status}</td><td><span className={'tag ' + o.status}>{o.status}</span></td><td>{o.courier_name ? `${o.courier_name} ${o.awb_number || ''}` : '—'}</td>
          <td><div className="acts">
            {['placed', 'accepted'].includes(o.status) && !(o.payment_method === 'online' && o.payment_status !== 'paid') && <form action={advanceOrder}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="return_to" value="list" /><button className="btn sm" type="submit">{o.status === 'placed' ? 'Accept' : 'Mark packed'}</button></form>}
            {o.status === 'packed' && <Link className="btn sm" href={`/admin/orders/${o.id}`}>Ship…</Link>}
            {o.status === 'shipped' && <form action={advanceOrder}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="return_to" value="list" /><button className="btn sm ghost" type="submit">Mark delivered</button></form>}
            {['placed', 'accepted', 'packed'].includes(o.status) && <form action={cancelOrder}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="return_to" value="list" /><select name="reason" required defaultValue="" aria-label="Cancel reason" style={{ maxWidth: 150, marginRight: 6 }}><option value="" disabled>Reason…</option>{CANCEL_REASONS.store.filter((r) => r !== 'Other').map((r) => <option key={r}>{r}</option>)}</select><ConfirmButton className="btn sm danger" message={`Cancel order ${o.order_number}? Stock comes back.`}>Cancel</ConfirmButton></form>}
            {['packed', 'shipped', 'delivered'].includes(o.status) && <a className="btn sm ghost" href={`/admin/orders/${o.id}/label`}>Label</a>}
          </div></td></tr>)}
        {!rows?.length && <tr><td colSpan={8} className="muted">No orders.</td></tr>}
      </tbody></table></div>
    </div>
  );
}
