import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import Flash from '@/components/Flash';
import RefundForm from '@/components/RefundForm';
import RefundNote from '@/components/RefundNote';
import { resolveIssue, refundIssue } from '../actions';
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams;
  const { data: rows, error } = await admin().from('payment_issues').select('*, orders(order_number)').order('created_at', { ascending: false }).limit(200);
  return (
    <div><h1>Payment issues</h1><Flash sp={sp} />
      <p className="muted">Money arrived at Razorpay but the order was cancelled or could not be confirmed. Paid orders cancelled before shipping are refunded automatically; any that could not be refunded wait here. Press “Refund now” to send the money back to the customer through Razorpay. If you already refunded it yourself in Razorpay, press “Mark refunded”.</p>
      {error && <div className="bad">Could not load. Did you run 02_payment_issues.sql and 06_offers_email_site.sql?</div>}
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Date</th><th>Order</th><th>Payment id</th><th>Amount</th><th>Reason</th><th></th></tr></thead><tbody>
        {(rows || []).map((r) => <tr key={r.id}><td>{new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</td><td>{r.orders?.order_number || '—'}</td><td>{r.razorpay_payment_id}</td><td>₹{(r.amount_paise || 0) / 100}</td><td>{r.reason}</td>
          <td>{r.resolved ? (r.refund_id ? <div><RefundNote amount={r.refunded_paise != null ? r.refunded_paise / 100 : (r.amount_paise || 0) / 100} gst={r.deduct_gst} fee={r.deduct_fee} other={r.deduct_other} note={r.deduct_note} /><div className="muted">{r.refund_id}</div></div> : <span className="ok">Done</span>) : r.refund_state === 'processing' ? <div><span className="muted">Refund started but not confirmed. Check Razorpay Dashboard. If the refund is there, press the button below.</span>
            <form action={resolveIssue} style={{ marginTop: 6 }}><input type="hidden" name="id" value={r.id} /><button className="btn ghost" style={{ minHeight: 36, padding: '0 14px' }} type="submit">Mark refunded (seen in Razorpay)</button></form></div> : <div>
            <RefundForm id={r.id} base={(r.amount_paise || 0) / 100} primary={{ label: 'Refund now', action: refundIssue }} />
            <form action={resolveIssue} style={{ marginTop: 6 }}><input type="hidden" name="id" value={r.id} /><button className="btn ghost" style={{ minHeight: 36, padding: '0 14px' }} type="submit">Mark refunded (done in Razorpay already)</button></form></div>}</td></tr>)}
        {!rows?.length && <tr><td colSpan={6} className="muted">No issues. 🎉</td></tr>}
      </tbody></table></div></div>
  );
}
