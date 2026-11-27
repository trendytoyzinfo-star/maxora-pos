// SERVER ONLY. Shared by the courier webhook, the daily tracking check and the admin "check now" button.
import { admin } from '@/lib/supabaseAdmin';

export async function markDelivered(orderId, note) {
  const db = admin(), now = new Date().toISOString();
  const { data: o } = await db.from('orders').select('id,payment_method').eq('id', orderId).eq('status', 'shipped').maybeSingle();
  if (!o) return false;
  const upd = { status: 'delivered', delivered_at: now, updated_at: now };
  if (o.payment_method === 'cod') upd.payment_status = 'paid';   // cash collected by the courier
  const { data: rows, error } = await db.from('orders').update(upd).eq('id', o.id).eq('status', 'shipped').select('id');
  if (error) throw new Error(error.message);
  if (!rows?.length) return false;
  await db.from('order_status_history').insert({ order_id: o.id, status: 'delivered', note });
  return true;
}

// Asks the courier for the status of every shipped order. Only couriers with a free API are supported here:
//   Delhivery -> set DELHIVERY_API_TOKEN in Vercel. Other couriers: use a shipping service (e.g. Shiprocket) that calls /api/courier/webhook,
//   or press "Mark as delivered" yourself.
export async function checkShippedOrders() {
  const db = admin(), out = { checked: 0, delivered: 0, skipped: 0 };
  const token = process.env.DELHIVERY_API_TOKEN;
  const { data: rows } = await db.from('orders').select('id,courier_name,awb_number').eq('status', 'shipped').limit(100);
  for (const o of rows || []) {
    if (!o.awb_number || !/^[A-Za-z0-9-]{4,60}$/.test(o.awb_number) || !(o.courier_name === 'Delhivery' && token)) { out.skipped++; continue; }
    out.checked++;
    try {
      const r = await fetch(`https://track.delhivery.com/api/v1/packages/json/?waybill=${encodeURIComponent(o.awb_number)}`, { headers: { Authorization: `Token ${token}`, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const j = await r.json();
      const st = String(j?.ShipmentData?.[0]?.Shipment?.Status?.Status || '').toLowerCase();
      if (st === 'delivered' && await markDelivered(o.id, 'Delivered (Delhivery tracking)')) out.delivered++;
    } catch (e) { console.error('track', o.awb_number, e.message); }
  }
  return out;
}
