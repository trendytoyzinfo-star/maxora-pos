// SERVER ONLY. Customer accounts (Supabase Auth, email + password). Separate from the admin cookie.
import { cookies } from 'next/headers';
import { admin } from '@/lib/supabaseAdmin';
export const AT = 'tt_at', RT = 'tt_rt';
const base = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };
export const safeNext = (v, fallback = '/account') => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v.slice(0, 200) : fallback);
export async function getCustomer() {
  const t = (await cookies()).get(AT)?.value;
  if (!t) return null;
  const { data, error } = await admin().auth.getUser(t);
  const u = data?.user;
  if (error || !u?.email) return null;
  return { id: u.id, email: u.email, name: u.user_metadata?.name || '', phone: u.user_metadata?.phone || '' };
}
export async function setSession(s) {
  const c = await cookies();
  c.set(AT, s.access_token, { ...base, maxAge: s.expires_in || 3600 });
  c.set(RT, s.refresh_token, { ...base, maxAge: 60 * 60 * 24 * 30 });
}
export async function clearSession() { const c = await cookies(); c.delete(AT); c.delete(RT); }
