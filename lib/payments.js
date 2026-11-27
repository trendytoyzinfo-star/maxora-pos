// SERVER ONLY. Marks an order as paid after checking with Razorpay that the money really arrived.
import { fetchPayment, capturePayment } from './razorpay';
import { after } from 'next/server';
import { emailOrderConfirmation } from './orderEmails';

export async function settlePayment(db, { order, paymentId, source }) {
  if (order.payment_status === 'paid') return { ok: true, already: true };
  let pay = await fetchPayment(paymentId);
  if (pay.order_id !== order.razorpay_order_id) return { ok: false, code: 'mismatch', error: 'Payment does not belong to this order.' };
  if (pay.status === 'authorized') pay = await capturePayment(paymentId, pay.amount);   // only needed if auto-capture is off
  if (pay.status !== 'captured') return { ok: false, code: 'not_captured', error: `Payment is ${pay.status}.` };
  const { error } = await db.rpc('confirm_order_payment', { p_order_id: order.id, p_razorpay_order_id: order.razorpay_order_id, p_payment_id: paymentId, p_amount_paise: pay.amount, p_source: source });
  if (error) return { ok: false, code: error.message?.includes('cancelled') ? 'cancelled' : 'db', error: error.message };
  after(() => emailOrderConfirmation(order.id));   // the database makes sure it is sent only once
  return { ok: true };
}
