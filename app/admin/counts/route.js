import { admin } from '@/lib/supabaseAdmin';
import { getAdmin } from '@/lib/adminAuth';
import { adminCounts } from '@/lib/adminCounts';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!(await getAdmin())) return Response.json({ orders: 0, returns: 0 }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return Response.json(await adminCounts(admin()), { headers: { 'Cache-Control': 'no-store' } });
}
