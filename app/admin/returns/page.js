import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { inr } from '@/lib/format';
import { reasonLabel } from '@/lib/returnPolicy';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';
import SeenMarker from '@/components/SeenMarker';
import { acceptReturn, rejectReturn, advanceReturn, refundReturn } from '../actions';
const TABS = ['open', 'requested', 'approved', 'received', 'refunded', 'rejected', 'all'];
const dt = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams, db = admin();
  const tab = TABS.includes(sp.s) ? sp.s : 'open';
  let q = db.from('return_claims').select('*, orders(id,order_number,customer_name,customer_phone,total,payment_method,payment_status,razorpay_payment_id,delivered_at)').order('created_at', { ascending: false }).limit(200);
  if (tab === 'open') q = q.in('status', ['requested', 'approved', 'received']); else if (tab !== 'all') q = q.eq('status', tab);
  const { data: rows } = await q;
  const unseen = (rows || []).filter((x) => !x.seen_at).map((x) => x.id);
  // photos are private: make links that work for one hour
  const signed = {};
  for (const x of rows || []) if (x.photos?.length) { const { data } = await db.storage.from('return-proofs').createSignedUrls(x.photos, 3600); signed[x.id] = (data || []).map((d) => d.signedUrl).filter(Boolean); }
  return (
    <div><h1>Returns and refunds</h1><Flash sp={sp} /><SeenMarker kind="returns" ids={unseen} />
      <p className="muted">Customers send a return from their order page (only within 24 hours of delivery, with a reason and photos). You accept or reject it here. For online orders press “Refund via Razorpay”. For COD orders refund by UPI/bank yourself, then press “Mark refunded”.</p>
      <div className="pills">{TABS.map((t) => <a key={t} href={`/admin/returns?s=${t}`} className={'pill' + (t === tab ? ' on' : '')}>{t}</a>)}</div>
      <div className="ret-list">
        {(rows || []).map((x) => (
          <div className="box ret" key={x.id}>
            <div className="ret-h"><div><b>{x.orders?.order_number}</b> · {x.orders?.customer_name} · {x.orders?.customer_phone}
              <div className="muted">Order {inr(x.orders?.total || 0)} · {x.orders?.payment_method === 'cod' ? 'COD' : 'Online'} · requested {dt(x.created_at)}</div></div>
              <span>{!x.seen_at && <span className="tag newtag">NEW</span>} <span className={'tag ' + x.status}>{x.status}</span></span></div>
            <div><b>{reasonLabel(x.reason)}</b><div>{x.details}</div></div>
            <div className="ret-ph">{(signed[x.id] || []).map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={`Photo ${i + 1}`} /></a>)}{!signed[x.id]?.length && <span className="muted">No photos</span>}</div>
            {x.admin_note && <div className="muted">Your note: {x.admin_note}</div>}
            {x.status === 'refunded' && <div className="ok">Refunded {inr(x.refund_amount || 0)}</div>}
            {x.status === 'requested' && <form className="ret-f"><input type="hidden" name="id" value={x.id} />
              <input name="admin_note" placeholder="Message to customer (needed if you reject)" maxLength={300} />
              <button className="btn" type="submit" formAction={acceptReturn}>Accept return</button>
              <ConfirmButton formAction={rejectReturn} message="Reject this return? The customer will see your message.">Reject</ConfirmButton></form>}
            {x.status === 'approved' && <form action={advanceReturn} className="ret-f"><input type="hidden" name="id" value={x.id} /><input type="hidden" name="to" value="received" />
              <input name="admin_note" placeholder="Note (optional)" maxLength={300} /><button className="btn" type="submit">Mark item received</button></form>}
            {x.status === 'received' && <form action={advanceReturn} className="ret-f"><input type="hidden" name="id" value={x.id} /><input type="hidden" name="to" value="refunded" />
              <input name="refund_amount" type="number" min="1" step="1" required placeholder="Refund amount ₹" defaultValue={x.orders?.total ? Number(x.orders.total) : ''} />
              {x.orders?.payment_method === 'online' && x.orders?.payment_status === 'paid' && x.orders?.razorpay_payment_id && <button className="btn" type="submit" formAction={refundReturn}>Refund via Razorpay</button>}
              <button className="btn ghost" type="submit">Mark refunded</button></form>}
          </div>))}
        {!rows?.length && <div className="muted">No returns here.</div>}
      </div></div>
  );
}
