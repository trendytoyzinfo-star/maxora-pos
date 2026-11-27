import { createClient } from '@supabase/supabase-js';
import { admin } from '@/lib/supabaseAdmin';
export const dynamic = 'force-dynamic';
const bad = (error, status = 400) => Response.json({ error }, { status });
// Called by the reset page. Two kinds of link are accepted:
//   token_hash  : from our email (or the Supabase email template). Used up only now, when the customer presses Save.
//   access_token: from the older Supabase link that ends in #access_token=...
export async function POST(req) {
  const b = await req.json().catch(() => null);
  const pw = typeof b?.password === 'string' ? b.password : '';
  if (pw.length < 8 || pw.length > 72) return bad('Password must be 8 to 72 characters.');
  try {
    const db = admin();
    let userId = null;
    if (typeof b?.token_hash === 'string' && b.token_hash) {
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await anon.auth.verifyOtp({ token_hash: b.token_hash, type: 'recovery' });
      userId = !error ? data?.user?.id : null;
    } else if (typeof b?.access_token === 'string' && b.access_token) {
      const { data, error } = await db.auth.getUser(b.access_token);
      userId = !error ? data?.user?.id : null;
    }
    if (!userId) return bad('This link has expired or was already used. Please ask for a new one.', 401);
    const { error: e2 } = await db.auth.admin.updateUserById(userId, { password: pw });
    if (e2) return bad('Could not change the password. Please try again.', 500);
    return Response.json({ ok: true });
  } catch (e) {
    console.error('reset failed', e.message);
    return bad('Something went wrong. Please try again.', 500);
  }
}
