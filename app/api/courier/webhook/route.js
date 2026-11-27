import { admin } from '@/lib/supabaseAdmin';
import { markDelivered } from '@/lib/orderFlow';
import { timingSafeStr } from '@/lib/razorpay';
export const dynamic = 'force-dynamic';

// Marks an order "delivered" when your courier or shipping service (for example Shiprocket) says it was delivered.
// Set COURIER_WEBHOOK_SECRET in Vercel. Give your shipping service this address and the same secret in the "x-api-key" header:
//   https://trendytoyz.in/api/courier/webhook
const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '' && typeof o[k] !== 'object') return String(o[k]); return ''; };
export async function POST(req) {
  const secret = process.env.COURIER_WEBHOOK_SECRET;
  if (!secret) return new Response('not configured', { status: 500 });
  if (!timingSafeStr(secret, req.headers.get('x-api-key') || '')) return new Response('unauthorized', { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return new Response('bad json', { status: 400 });
  const ship = b.Shipment || b.shipment || b;
  const awb = pick(ship, ['awb', 'awb_code', 'AWB', 'waybill', 'Waybill']).trim();
  const status = (pick(ship, ['current_status', 'status', 'Status']) || pick(ship?.Status, ['Status'])).toLowerCase();
  if (!/^[A-Za-z0-9-]{4,60}$/.test(awb)) return new Response('ignored', { status: 200 });
  if (!status.includes('delivered') || /undelivered|not delivered|rto|return/.test(status)) return new Response('ignored', { status: 200 });
  const db = admin();
  const { data: o } = await db.from('orders').select('id').eq('awb_number', awb).eq('status', 'shipped').maybeSingle();
  if (!o) return new Response('no matching shipped order', { status: 200 });
  try { await markDelivered(o.id, 'Delivered (courier update)'); } catch (e) { console.error('courier webhook', e.message); return new Response('retry', { status: 500 }); }
  return new Response('ok', { status: 200 });
}
