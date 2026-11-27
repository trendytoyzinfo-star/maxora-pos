import { admin } from '@/lib/supabaseAdmin';
import { verifyWebhookSignature } from '@/lib/razorpay';
import { settlePayment } from '@/lib/payments';

export const dynamic = 'force-dynamic';

// Safety net: confirms the payment even if the shopper closed the tab right after paying.
// Razorpay dashboard -> Webhooks -> URL https://trendytoyz.in/api/razorpay/webhook, events: payment.captured, order.paid
export async function POST(req) {
  const raw = await req.text();
  let valid = false;
  try { valid = verifyWebhookSignature(raw, req.headers.get('x-razorpay-signature')); } catch (e) { console.error('webhook config', e.message); return new Response('not configured', { status: 500 }); }
  if (!valid) return new Response('bad signature', { status: 400 });

  let evt; try { evt = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  if (evt.event !== 'payment.captured' && evt.event !== 'order.paid') return new Response('ignored', { status: 200 });
  const pay = evt.payload?.payment?.entity;
  if (!pay?.id || !pay.order_id) return new Response('ignored', { status: 200 });

  const db = admin();
  const { data: order } = await db.from('orders').select('id,payment_status,razorpay_order_id').eq('razorpay_order_id', pay.order_id).maybeSingle();
  if (!order) return new Response('not our order', { status: 200 });
  try {
    const r = await settlePayment(db, { order, paymentId: pay.id, source: 'webhook' });
    if (!r.ok) {
      console.error('webhook could not settle', order.id, r.code, r.error);
      // Money arrived but the order cannot be confirmed (e.g. it expired): save it so it is refunded, not forgotten.
      if (r.code === 'cancelled' || r.code === 'mismatch') await db.from('payment_issues').insert({ order_id: order.id, razorpay_payment_id: pay.id, amount_paise: pay.amount, reason: r.code, detail: r.error }).then(() => {}, () => {});
      return new Response(r.code === 'db' ? 'retry' : 'logged', { status: r.code === 'db' ? 500 : 200 });
    }
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('webhook failed', e.message);
    return new Response('retry', { status: 500 });
  }
}
