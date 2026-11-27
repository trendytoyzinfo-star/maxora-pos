import { admin } from '@/lib/supabaseAdmin';
import { timingSafeStr } from '@/lib/razorpay';
import { isUuid } from '@/lib/validate';
import { invoicePdf } from '@/lib/pdfDocs';
import { getBiz } from '@/lib/storeInfo';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Customer bill. Needs the same private link token as the order page. Not available for unpaid online or cancelled orders.
export async function GET(req, { params }) {
  const { id } = await params, t = new URL(req.url).searchParams.get('t') || '';
  if (!isUuid(id) || !t) return new Response('Not found', { status: 404 });
  const { data: o } = await admin().from('orders').select('*, order_items(*)').eq('id', id).maybeSingle();
  if (!o || !timingSafeStr(o.access_token, t)) return new Response('Not found', { status: 404 });
  if (o.status === 'cancelled' || (o.payment_method === 'online' && o.payment_status !== 'paid')) return new Response('Invoice is available once the order is confirmed.', { status: 409 });
  return new Response(invoicePdf(o, await getBiz()), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="invoice-${o.order_number}.pdf"`, 'Cache-Control': 'no-store' } });
}
