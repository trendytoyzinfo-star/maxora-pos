import { checkShippedOrders } from '@/lib/orderFlow';
import { timingSafeStr } from '@/lib/razorpay';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
// Vercel Cron calls this once a day (see vercel.json) and sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response('not configured', { status: 500 });
  if (!timingSafeStr(`Bearer ${secret}`, req.headers.get('authorization') || '')) return new Response('unauthorized', { status: 401 });
  return Response.json(await checkShippedOrders());
}
