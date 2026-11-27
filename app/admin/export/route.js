import { reasonLabel } from '@/lib/returnPolicy';
import { getAdmin } from '@/lib/adminAuth';
import { admin } from '@/lib/supabaseAdmin';
import { parseRange, fetchAll, istDay } from '@/lib/range';
import { toCsv } from '@/lib/csv';
export const dynamic = 'force-dynamic';
const dt = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) : '');
export async function GET(req) {
  if (!(await getAdmin())) return new Response('Not allowed', { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams), r = parseRange(sp), db = admin();
  let csv;
  try {
    if (sp.type === 'orders') {
      const rows = await fetchAll(() => db.from('orders').select('*').gte('created_at', r.fromIso).lte('created_at', r.toIso).order('created_at').order('id'));
      csv = toCsv(rows, [
        { label: 'Order', get: (o) => o.order_number }, { label: 'Date', get: (o) => dt(o.created_at) }, { label: 'Customer', get: (o) => o.customer_name }, { label: 'Phone', get: (o) => o.customer_phone }, { label: 'Email', get: (o) => o.customer_email },
        { label: 'Address', get: (o) => [o.shipping_address?.line1, o.shipping_address?.line2, o.shipping_address?.landmark].filter(Boolean).join(', ') }, { label: 'City', get: (o) => o.shipping_address?.city }, { label: 'State', get: (o) => o.shipping_address?.state }, { label: 'Pincode', get: (o) => o.shipping_address?.pincode },
        { label: 'Payment method', get: (o) => o.payment_method }, { label: 'Payment status', get: (o) => o.payment_status }, { label: 'Status', get: (o) => o.status },
        { label: 'Subtotal', get: (o) => o.subtotal }, { label: 'Shipping', get: (o) => o.shipping_total }, { label: 'Discount', get: (o) => o.discount }, { label: 'Total', get: (o) => o.total }, { label: 'Coupon', get: (o) => o.coupon_code },
        { label: 'Courier', get: (o) => o.courier_name }, { label: 'AWB', get: (o) => o.awb_number }, { label: 'Shipped at', get: (o) => dt(o.shipped_at) }, { label: 'Delivered at', get: (o) => dt(o.delivered_at) }, { label: 'Cancel reason', get: (o) => o.cancel_reason }]);
    } else if (sp.type === 'items') {
      const rows = await fetchAll(() => db.from('order_items').select('*, orders!inner(order_number,created_at,status)').gte('orders.created_at', r.fromIso).lte('orders.created_at', r.toIso).order('id'));
      csv = toCsv(rows, [{ label: 'Order', get: (i) => i.orders?.order_number }, { label: 'Date', get: (i) => istDay(i.orders?.created_at) }, { label: 'Order status', get: (i) => i.orders?.status }, { label: 'Product', get: (i) => i.product_name }, { label: 'Option', get: (i) => i.variant_name }, { label: 'SKU', get: (i) => i.sku }, { label: 'Quantity', get: (i) => i.quantity }, { label: 'Unit price', get: (i) => i.unit_price }, { label: 'Line total', get: (i) => i.line_total }, { label: 'Free toy', get: (i) => (i.is_free ? 'yes' : '') }]);
    } else if (sp.type === 'returns') {
      const rows = await fetchAll(() => db.from('return_claims').select('*, orders(order_number,customer_name,total)').gte('created_at', r.fromIso).lte('created_at', r.toIso).order('created_at').order('id'));
      csv = toCsv(rows, [{ label: 'Date', get: (x) => dt(x.created_at) }, { label: 'Order', get: (x) => x.orders?.order_number }, { label: 'Customer', get: (x) => x.orders?.customer_name }, { label: 'Order total', get: (x) => x.orders?.total }, { label: 'Reason', get: (x) => reasonLabel(x.reason) }, { label: 'Details', get: (x) => x.details }, { label: 'Status', get: (x) => x.status }, { label: 'Refund amount', get: (x) => x.refund_amount }, { label: 'Note', get: (x) => x.admin_note }]);
    } else if (sp.type === 'customers') {
      const rows = await fetchAll(() => db.from('orders').select('customer_name,customer_phone,customer_email,total,status,created_at').order('created_at').order('id'));
      const m = new Map();
      for (const o of rows) { const c = m.get(o.customer_phone) || { phone: o.customer_phone, orders: 0, spent: 0 }; c.name = o.customer_name; if (o.customer_email) c.email = o.customer_email; c.last = o.created_at; if (o.status !== 'cancelled') { c.orders += 1; c.spent += Number(o.total); } m.set(o.customer_phone, c); }
      csv = toCsv([...m.values()], [{ label: 'Name', get: (c) => c.name }, { label: 'Phone', get: (c) => c.phone }, { label: 'Email', get: (c) => c.email }, { label: 'Orders', get: (c) => c.orders }, { label: 'Total spent', get: (c) => c.spent }, { label: 'Last order', get: (c) => dt(c.last) }]);
    } else return new Response('Unknown report', { status: 400 });
  } catch (e) { console.error('export failed', e.message); return new Response('Could not create the file', { status: 500 }); }
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="trendytoyz-${sp.type}-${r.from}_to_${r.to}.csv"`, 'Cache-Control': 'no-store' } });
}
