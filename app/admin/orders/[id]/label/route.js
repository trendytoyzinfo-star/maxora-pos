import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { isUuid } from '@/lib/validate';
import { labelPdf } from '@/lib/pdfDocs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(_req, { params }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) return new Response('Not found', { status: 404 });
  const { data: o } = await admin().from('orders').select('*, order_items(*)').eq('id', id).maybeSingle();
  if (!o) return new Response('Not found', { status: 404 });
  return new Response(labelPdf(o), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="label-${o.order_number}.pdf"`, 'Cache-Control': 'no-store' } });
}
