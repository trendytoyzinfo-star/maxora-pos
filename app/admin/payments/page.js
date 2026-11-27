import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';
import { resolveIssue, refundIssue } from '../actions';
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams;
  const { data: rows, error } = await admin().from('payment_issues').select('id,razorpay_payment_id,amount_paise,reason,detail,resolved,refund_state,refund_id,created_at,orders(order_number)').order('created_at', { ascending: false }).limit(200);
  return (
    <div><h1>Payment issues</h1><Flash sp={sp} />
      <p className="muted">Money arrived at Razorpay but the order was cancelled or could not be confirmed. Press “Refund now” to send the money back to the customer through Razorpay. If you already refunded it yourself in Razorpay, press “Mark refunded”.</p>
      {error && <div className="bad">Could not load. Did you run 02_payment_issues.sql and 06_offers_email_site.sql?</div>}
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Date</th><th>Order</th><th>Payment id</th><th>Amount</th><th>Reason</th><th></th></tr></thead><tbody>
        {(rows || []).map((r) => <tr key={r.id}><td>{new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</td><td>{r.orders?.order_number || '—'}</td><td>{r.razorpay_payment_id}</td><td>₹{(r.amount_paise || 0) / 100}</td><td>{r.reason}</td>
          <td>{r.resolved ? <span className="ok">{r.refund_id ? `Refunded (${r.refund_id})` : 'Done'}</span> : r.refund_state === 'processing' ? <span className="muted">Refund started. If it does not finish, check Razorpay Dashboard.</span> : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <form action={refundIssue}><input type="hidden" name="id" value={r.id} /><ConfirmButton className="btn" message={`Refund ₹${(r.amount_paise || 0) / 100} to the customer through Razorpay now?`}>Refund now</ConfirmButton></form>
            <form action={resolveIssue}><input type="hidden" name="id" value={r.id} /><button className="btn ghost" style={{ minHeight: 36, padding: '0 14px' }} type="submit">Mark refunded</button></form></div>}</td></tr>)}
        {!rows?.length && <tr><td colSpan={6} className="muted">No issues. 🎉</td></tr>}
      </tbody></table></div></div>
  );
}
