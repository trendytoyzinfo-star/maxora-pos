import { admin } from '@/lib/supabaseAdmin';
import { verifyCheckoutSignature, timingSafeStr } from '@/lib/razorpay';
import { settlePayment } from '@/lib/payments';
import { isUuid } from '@/lib/validate';

export const dynamic = 'force-dynamic';
const out = (body, status = 200) => Response.json(body, { status });

// The browser calls this right after Razorpay says "paid". We re-check everything ourselves.
export async function POST(req) {
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.order_id) || typeof b.access_token !== 'string' || typeof b.razorpay_payment_id !== 'string') return out({ ok: false, error: 'Invalid request.' }, 400);
  const db = admin();
  const { data: order } = await db.from('orders').select('id,access_token,payment_status,razorpay_order_id').eq('id', b.order_id).maybeSingle();
  if (!order || !timingSafeStr(order.access_token, b.access_token)) return out({ ok: false, error: 'Order not found.' }, 404);
  if (b.razorpay_order_id !== order.razorpay_order_id || !verifyCheckoutSignature(order.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature)) return out({ ok: false, error: 'Payment could not be verified.' }, 400);
  try {
    const r = await settlePayment(db, { order, paymentId: b.razorpay_payment_id, source: 'checkout' });
    return out(r, r.ok ? 200 : 409);
  } catch (e) {
    console.error('verify failed', e.message);
    return out({ ok: false, error: 'Could not confirm payment yet.' }, 502);   // the webhook will still confirm it
  }
}
