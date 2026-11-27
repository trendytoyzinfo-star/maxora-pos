import Link from 'next/link';
import { notFound } from 'next/navigation';
import { admin } from '@/lib/supabaseAdmin';
import { timingSafeStr } from '@/lib/razorpay';
import { isUuid } from '@/lib/validate';
import { imgUrl } from '@/lib/supabase';
import { inr } from '@/lib/format';
import OrderWatcher from '@/components/OrderWatcher';
import Flash from '@/components/Flash';
import PolicyNote from '@/components/PolicyNote';
import ConfirmButton from '@/components/ConfirmButton';
import ImagePicker from '@/components/ImagePicker';
import { cancelMyOrder, requestReturn } from '../actions';
import { RETURN_REASONS, reasonLabel, canCancel, canReturn, returnDeadline, CANCEL_REASONS } from '@/lib/returnPolicy';
import { BIZ } from '@/lib/business';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your order', robots: { index: false, follow: false } };

const STEPS = ['placed', 'accepted', 'packed', 'shipped', 'delivered'];
const LABEL = { placed: 'Order placed', accepted: 'Confirmed', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered' };

export default async function OrderPage({ params, searchParams }) {
  const { id } = await params; const sp = await searchParams;
  const t = typeof sp.t === 'string' ? sp.t : '';
  if (!isUuid(id) || !t) notFound();
  const { data: o } = await admin().from('orders').select('*, order_items(*)').eq('id', id).maybeSingle();
  if (!o || !timingSafeStr(o.access_token, t)) notFound();   // wrong link = same page as "does not exist"

  const cod = o.payment_method === 'cod', paid = o.payment_status === 'paid', cancelled = o.status === 'cancelled';
  const waiting = !cod && !paid && !cancelled;
  const a = o.shipping_address || {};
  const step = STEPS.indexOf(o.status);
  const [{ data: hist }, { data: claim }] = await Promise.all([
    admin().from('order_status_history').select('status,created_at').eq('order_id', id).order('created_at'),
    admin().from('return_claims').select('reason,details,status,refund_amount,admin_note,created_at').eq('order_id', id).maybeSingle(),
  ]);
  const at = {}; for (const h of hist || []) if (!at[h.status]) at[h.status] = h.created_at;
  const when = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const deadline = returnDeadline(o);
  const CLAIM = { requested: 'Waiting for our review', approved: 'Accepted. We will contact you on WhatsApp for the next step.', rejected: 'Not accepted', received: 'Item received, refund in process', refunded: 'Refunded' };

  return (
    <div className="wrap order">
      <OrderWatcher orderId={o.id} done={(cod || paid) && !cancelled} waiting={waiting} />
      <Flash sp={sp} />
      <div className="box center">
        {cancelled ? <><h1>Order cancelled</h1><p>Order <b>{o.order_number}</b> was cancelled{o.cancel_reason ? `: ${o.cancel_reason}` : ''}. {paid && 'If money was deducted, it will be refunded to you.'}</p></>
          : waiting ? <><h1>Confirming your payment…</h1><p>Order <b>{o.order_number}</b>. Please do not close this page. This usually takes a few seconds. If money was deducted, your order will be confirmed automatically.</p></>
          : <><h1>Thank you{o.customer_name ? `, ${o.customer_name.split(' ')[0]}` : ''}!</h1><p>Your order <b>{o.order_number}</b> is {cod ? 'placed. Please keep ' + inr(o.total) + ' ready at delivery.' : 'confirmed and paid.'}</p></>}
        <p className="muted">Save this page link to check your order any time. For help, WhatsApp +91 8446418374 with your order number.</p>
      </div>

      {!cancelled && !waiting && step >= 0 && <ol className="steps">{STEPS.map((s, i) => <li key={s} className={i <= step ? 'on' : ''}>{LABEL[s]}{at[s] && <small>{when(at[s])}</small>}</li>)}</ol>}
      {o.awb_number && <div className="box">Shipped via <b>{o.courier_name || 'courier'}</b>, tracking number <b>{o.awb_number}</b>{o.tracking_url && <> · <a className="link" href={o.tracking_url} target="_blank" rel="noopener noreferrer">Track package</a></>}</div>}

      <div className="cart" style={{ paddingTop: 0 }}>
        <div className="lines">
          {(o.order_items || []).map((i) => (
            <div className="line" key={i.id}>
              <img src={imgUrl(i.image_path)} alt="" />
              <div className="nm">{i.product_name}{i.variant_name && <div className="muted">{i.variant_name}</div>}<div className="muted">Qty {i.quantity} × {inr(i.unit_price)}{i.is_free && <> · <b className="ok">🎁 Free{o.offer_label ? ` (${o.offer_label.replace(' (free toys)', '')})` : ''}</b></>}</div></div>
              <b>{i.is_free ? <><s>{inr(i.line_total)}</s> FREE</> : inr(i.line_total)}</b>
            </div>))}
        </div>
        <aside className="sum">
          <h2 style={{ margin: 0 }}>Summary</h2>
          <div className="r"><span>Subtotal</span><span>{inr(o.subtotal)}</span></div>
          {Number(o.discount) > 0 && <div className="r"><span>Discount{o.offer_label || o.coupon_code ? ` (${o.offer_label || o.coupon_code})` : ''}</span><span>− {inr(o.discount)}</span></div>}
          <div className="r"><span>Shipping</span><span>{Number(o.shipping_total) ? inr(o.shipping_total) : 'Free'}</span></div>
          <div className="r t"><span>Total</span><span>{inr(o.total)}</span></div>
          <div className="muted">{cod ? 'Cash on delivery' : paid ? 'Paid online' : 'Payment pending'}</div>
          <h3 style={{ margin: '8px 0 0' }}>Delivering to</h3>
          <div className="muted">{a.full_name}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}{a.landmark ? `, ${a.landmark}` : ''}<br />{a.city}, {a.state} {a.pincode}<br />Phone {a.phone}</div>
        </aside>
      </div>
      {!cancelled && !waiting && <p><a className="btn" href={`/order/${o.id}/invoice?t=${encodeURIComponent(t)}`}>Download invoice (PDF)</a></p>}

      <div id="help" className="box">
        <h2 style={{ margin: 0 }}>Cancel or return</h2>
        {canCancel(o) && <form action={cancelMyOrder} className="adm-form"><input type="hidden" name="id" value={o.id} /><input type="hidden" name="t" value={t} />
          <p className="muted" style={{ margin: 0 }}>You can cancel this order because it has not been shipped yet.</p>
          <label>Why are you cancelling? *<select name="reason" required defaultValue=""><option value="" disabled>Choose a reason</option>{CANCEL_REASONS.customer.map((r) => <option key={r}>{r}</option>)}</select></label>
          <label>If you chose “Other”, write a few words<input name="reason_other" maxLength={120} /></label><ConfirmButton message="Cancel this order? This cannot be undone.">Cancel this order</ConfirmButton></form>}
        {!cancelled && !canCancel(o) && o.status !== 'delivered' && !waiting && <p className="muted" style={{ margin: 0 }}>This order is on its way, so it can no longer be cancelled. After delivery you can request a return here within {BIZ.returnHours} hours if the item is damaged, wrong, or the wrong size.</p>}
        {claim && <div className="box" style={{ background: '#F8FAFF' }}><b>Return request: {CLAIM[claim.status]}</b>
          <div className="muted">Reason: {reasonLabel(claim.reason)}<br />{claim.details}</div>
          {claim.admin_note && <div><b>Message from us:</b> {claim.admin_note}</div>}
          {claim.status === 'refunded' && claim.refund_amount != null && <div className="ok">Refunded {inr(claim.refund_amount)}</div>}</div>}
        {!claim && canReturn(o) && <form action={requestReturn} className="adm-form"><input type="hidden" name="id" value={o.id} /><input type="hidden" name="t" value={t} />
          <p className="muted" style={{ margin: 0 }}>Return window closes on <b>{when(deadline)}</b> ({BIZ.returnHours} hours after delivery). Only for a damaged item, wrong item or wrong size.</p>
          <label>Reason *<select name="reason" required defaultValue=""><option value="" disabled>Choose a reason</option>{RETURN_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
          <label>What is wrong? *<textarea name="details" rows={3} required minLength={10} maxLength={500} placeholder="Example: the car arrived with a broken wheel." /></label>
          <div><div className="lbl">Photos * (1 to 4 clear photos of the item and the parcel)</div><ImagePicker name="photos" max={4} required /></div>
          <button className="btn" type="submit">Send return request</button></form>}
        {!claim && o.status === 'delivered' && !canReturn(o) && <div className="box" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}><b className="bad">Return time out</b><span className="muted">Your order was delivered on {when(o.delivered_at)}. The {BIZ.returnHours}-hour return time ended on {when(deadline)}, so a return can no longer be requested.</span></div>}
        <PolicyNote />
      </div>
      <p><Link href="/products" className="btn ghost">Continue shopping</Link></p>
    </div>
  );
}
