'use server';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { admin } from '@/lib/supabaseAdmin';
import { setSession, clearSession, safeNext } from '@/lib/customerAuth';
import { cleanPhone } from '@/lib/validate';
import { headers } from 'next/headers';
import { SITE } from '@/lib/format';
import { sendPasswordReset } from '@/lib/passwordReset';
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const go = (page, next, msg) => redirect(`${page}?${next ? 'next=' + encodeURIComponent(next) + '&' : ''}err=${encodeURIComponent(msg)}`);

export async function signup(formData) {
  const next = safeNext(formData.get('next'), '/'), P = '/signup';
  const name = String(formData.get('name') || '').trim().slice(0, 60), email = String(formData.get('email') || '').trim().toLowerCase(), password = String(formData.get('password') || '');
  const phone = cleanPhone(formData.get('phone'));
  if (name.length < 2) return go(P, next, 'Please enter your name.');
  if (!EMAIL.test(email)) return go(P, next, 'Please enter a valid email address.');
  if (!phone) return go(P, next, 'Please enter a valid 10-digit mobile number.');
  if (password.length < 8 || password.length > 72) return go(P, next, 'Password must be 8 to 72 characters.');
  const { error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, phone } });
  if (error) return go(P, next, /already|registered|exists/i.test(error.message) ? 'An account with this email already exists. Please log in.' : 'Could not create your account. Please try again.');
  const { data, error: e2 } = await anon().auth.signInWithPassword({ email, password });
  if (e2 || !data?.session) return go('/login', next, 'Account created. Please log in.');
  await setSession(data.session);
  redirect(next);
}
export async function login(formData) {
  const next = safeNext(formData.get('next'), '/account'), email = String(formData.get('email') || '').trim().toLowerCase(), password = String(formData.get('password') || '');
  if (!email || !password) return go('/login', next, 'Enter your email and password.');
  const { data, error } = await anon().auth.signInWithPassword({ email, password });
  if (error || !data?.session) return go('/login', next, 'Wrong email or password.');
  await setSession(data.session);
  redirect(next);
}
export async function logout() { await clearSession(); redirect('/'); }

// Password reset. We never say whether an email has an account (so nobody can check who shops here).
export async function requestReset(formData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return go('/forgot-password', '', 'Please enter a valid email address.');
  const h = await headers(), host = h.get('x-forwarded-host') || h.get('host');
  const origin = host ? `https://${host}` : SITE;
  await sendPasswordReset(email, origin);
  redirect('/forgot-password?ok=' + encodeURIComponent('If an account exists for that email, we have sent a link to choose a new password. Check your inbox and spam folder.'));
}
