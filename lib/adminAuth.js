// SERVER ONLY. Admin login uses a Supabase Auth user, but only emails listed in ADMIN_EMAILS may enter.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { admin } from '@/lib/supabaseAdmin';

export const ADMIN_COOKIE = 'tt_admin';
export const adminEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export async function getAdmin() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  const u = data?.user;
  if (error || !u?.email || !u.email_confirmed_at) return null;
  return adminEmails().includes(u.email.toLowerCase()) ? { id: u.id, email: u.email } : null;
}
export async function requireAdmin() {
  const a = await getAdmin();
  if (!a) redirect('/admin/login');
  return a;
}
