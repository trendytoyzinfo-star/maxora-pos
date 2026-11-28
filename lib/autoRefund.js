// SERVER ONLY. Full refund, sent straight away, when a paid order is cancelled before shipping.
// It uses the same "Payment issues" row and the same lock as the "Refund now" button, so money is never sent twice.
import { admin } from '@/lib/supabaseAdmin';
import { refundPayment } from '@/lib/razorpay';

// Returns { state, amount }:
//   'done'    refund accepted by Razorpay
//   'failed'  Razorpay said no: the row stays in Payment issues with the "Refund now" button
//   'unknown' no clear answer (network / Razorpay server problem): check the Razorpay Dashboard, never retried by itself
//   'skipped' nothing to do here (already handled, or the row could not be found)
export async function autoRefundCancelledOrder(orderId) {
  let db, row;
  try {
    db = admin();
    const { data, error } = await db.from('payment_issues').update({ refund_state: 'processing' })
      .eq('order_id', orderId).eq('reason', 'refund_due').eq('resolved', false).is('refund_state', null)
      .select('id,razorpay_payment_id,amount_paise');
    if (error) { console.error('auto refund lock', orderId, error.message); return { state: 'skipped' }; }
    row = data?.[0];
    if (!row) return { state: 'skipped' };
  } catch (e) { console.error('auto refund lock', orderId, e.message); return { state: 'skipped' }; }

  const unlock = () => db.from('payment_issues').update({ refund_state: null }).eq('id', row.id);
  try {
    if (!(row.amount_paise > 0)) { await unlock(); return { state: 'failed' }; }
    const out = await refundPayment(row.razorpay_payment_id, row.amount_paise, { reason: 'TrendyToyz order cancelled' });
    const { error } = await db.from('payment_issues').update({ resolved: true, refund_state: 'done', refund_id: out.id, refunded_paise: row.amount_paise }).eq('id', row.id);
    if (error) console.error('auto refund sent but not saved', orderId, out.id, error.message);
    return { state: 'done', amount: row.amount_paise / 100, issueId: row.id };
  } catch (e) {
    console.error('auto refund', orderId, e.status || '', e.message);
    // A 4xx answer means Razorpay did not send the money. Anything else may have gone through, so keep the lock.
    if (e.status >= 400 && e.status < 500) { await unlock(); return { state: 'failed' }; }
    return { state: 'unknown' };
  }
}
