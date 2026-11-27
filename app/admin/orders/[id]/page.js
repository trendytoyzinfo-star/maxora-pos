import Link from 'next/link';
import { notFound } from 'next/navigation';
import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { isUuid } from '@/lib/validate';
import { inr } from '@/lib/format';
import Flash from '@/components/Flash';
import { advanceOrder, cancelOrder } from '../../actions';
import { CANCEL_REASONS } from '@/lib/returnPolicy';
import SeenMarker from '@/components/SeenMarker';
const FLOW = ['placed', 'accepted', 'packed', 'shipped', 'delivered'];
const BTN = { accepted: 'Accept order', packed: 'Mark as packed', shipped: 'Ship order', delivered: 'Mark as delivered' };
const when = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
export default async function Page({ params, searchParams }) {
  await requireAdmin();
  const { id } = await params; const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const db = admin();
  const [{ data: o }, { data: hist }, { data: couriers }] = await Promise.all([
    db.from('orders').select('*, order_items(*)').eq('id', id).maybeSingle(),
    db.from('order_status_history').select('status,note,created_at').eq('order_id', id).order('created_at'),
    db.from('couriers').select('id,name').eq('is_active', true).order('sort_order'),
  ]);
  if (!o) notFound();
  const a = o.shipping_address || {}, cancelled = o.status === 'cancelled';
  const next = FLOW[FLOW.indexOf(o.status) + 1];
  const blocked = o.payment_method === 'online' && o.payment_status !== 'paid';
  const canCancel = !['cancelled', 'shipped', 'delivered'].includes(o.status);
  const real = o.payment_method === 'cod' || o.payment_status === 'paid';
  return (
    <div>
      {!o.seen_at && real && <SeenMarker kind="orders" ids={[o.id]} />}
      <p><Link className="link" href="/admin/orders">← All orders</Link></p>
      <h1>Order {o.order_number}</h1><Flash sp={sp} />
      {!cancelled && <ol className="steps" style={{ margin: '4px 0 14px' }}>{FLOW.map((s, i) => <li key={s} className={i <= FLOW.indexOf(o.status) ? 'on' : ''}>{s}</li>)}</ol>}
      <div className="row" style={{ marginBottom: 12 }}>
        {['packed', 'shipped', 'delivered'].includes(o.status) && <a className="btn ghost" href={`/admin/orders/${o.id}/label`}>Download shipping label (PDF)</a>}
        {!cancelled && <a className="btn ghost" href={`/order/${o.id}/invoice?t=${encodeURIComponent(o.access_token)}`}>Customer invoice (PDF)</a>}
      </div>
      <div className="cart" style={{ paddingTop: 8 }}>
        <div className="lines">
          <div className="box"><b>Status: {o.status}</b> · {o.payment_method === 'cod' ? 'Cash on delivery' : 'Online'} · payment {o.payment_status}
            {o.razorpay_order_id && <div className="muted">Razorpay order {o.razorpay_order_id}</div>}
            {o.awb_number && <div>Courier <b>{o.courier_name}</b> · AWB <b>{o.awb_number}</b>{o.tracking_url && <> · <a className="link" href={o.tracking_url} target="_blank" rel="noopener noreferrer">Track</a></>}</div>}</div>
          {(o.order_items || []).map((i) => <div className="box" key={i.id}>{i.product_name}{i.variant_name ? ` (${i.variant_name})` : ''}{i.sku ? ` · SKU ${i.sku}` : ''} — Qty {i.quantity} × {inr(i.unit_price)} = {i.is_free ? <><s>{inr(i.line_total)}</s> <b>FREE toy</b></> : <b>{inr(i.line_total)}</b>}</div>)}
          {!cancelled && next && (blocked
            ? <div className="box bad">Online payment is not confirmed yet. Do not ship this order.</div>
            : <form action={advanceOrder} className="box adm-form" style={{ maxWidth: 'none' }}><input type="hidden" name="id" value={o.id} /><h3>Next step: {next}</h3>
              {next === 'shipped' && <>
                <label>Courier<select name="courier_id" required defaultValue=""><option value="" disabled>Select courier</option>{(couriers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label>Tracking number (AWB)<input name="awb_number" required minLength={4} maxLength={60} /></label>
                <p className="muted">The customer sees this tracking number and link on their order page.</p></>}
              <label>Note (optional)<input name="note" maxLength={200} /></label>
              <button className="btn" type="submit">{BTN[next]}</button></form>)}
          {canCancel && <form action={cancelOrder} className="box adm-form"><input type="hidden" name="id" value={o.id} /><h3>Cancel order</h3>
            <p className="muted">Stock and coupon come back. If the customer already paid online, it is added to Payment issues so you refund it.</p>
            <label>Reason *<select name="reason" required defaultValue=""><option value="" disabled>Choose a reason</option>{CANCEL_REASONS.store.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label>If you chose “Other”, write a few words<input name="reason_other" maxLength={120} /></label><button className="btn ghost" type="submit">Cancel this order</button></form>}
        </div>
        <aside className="sum">
          <h2 style={{ margin: 0 }}>{o.customer_name}</h2>
          <div className="muted">Phone {o.customer_phone}{o.customer_email ? <><br />{o.customer_email}</> : null}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}{a.landmark ? `, ${a.landmark}` : ''}<br />{a.city}, {a.state} {a.pincode}</div>
          <div className="r"><span>Subtotal</span><span>{inr(o.subtotal)}</span></div>
          {Number(o.discount) > 0 && <div className="r"><span>Discount {o.offer_label || o.coupon_code || ''}</span><span>− {inr(o.discount)}</span></div>}
          <div className="r"><span>Shipping</span><span>{inr(o.shipping_total)}</span></div><div className="r t"><span>Total</span><span>{inr(o.total)}</span></div>
          <h3 style={{ margin: 0 }}>History</h3>
          {(hist || []).map((h, i) => <div className="muted" key={i}>{when(h.created_at)} · {h.status}{h.note ? ` · ${h.note}` : ''}</div>)}
        </aside>
      </div>
    </div>
  );
}
