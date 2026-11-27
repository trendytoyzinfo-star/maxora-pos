import { getCustomer } from '@/lib/customerAuth';
export const dynamic = 'force-dynamic';
export async function GET() { const u = await getCustomer(); return Response.json({ in: !!u, name: u?.name || '' }, { headers: { 'Cache-Control': 'no-store' } }); }
