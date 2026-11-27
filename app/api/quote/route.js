import { admin } from '@/lib/supabaseAdmin';
import { cleanItems } from '@/lib/validate';
import { quote } from '@/lib/pricing';
import { getCustomer } from '@/lib/customerAuth';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const c = cleanItems(body?.items);
  if (c.error) return Response.json({ error: c.error }, { status: 400 });
  try {
    const user = await getCustomer();
    return Response.json(await quote(admin(), c.items, body?.coupon_code, { userId: user?.id, phone: user?.phone }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('quote failed', e.message);
    return Response.json({ error: 'Could not load prices. Please try again.' }, { status: 500 });
  }
}
