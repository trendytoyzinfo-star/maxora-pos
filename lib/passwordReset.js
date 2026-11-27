// SERVER ONLY. Sends the "choose a new password" email. Used by the customer's Forgot password page and by the admin's account help page.
import { createClient } from '@supabase/supabase-js';
import { admin } from '@/lib/supabaseAdmin';
import { emailEnabled } from '@/lib/email';
import { emailPasswordReset } from '@/lib/orderEmails';
export async function sendPasswordReset(email, origin) {
  const redirectTo = `${origin}/reset-password`;
  try {
    if (emailEnabled()) {   // our own email (Resend): no Supabase email limit, and the link is used up only when the customer presses Save
      const { data } = await admin().auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
      const hashed = data?.properties?.hashed_token;
      if (!hashed) return false;
      return !!(await emailPasswordReset(email, `${origin}/reset-password?token_hash=${encodeURIComponent(hashed)}`)).ok;
    }
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo });   // Supabase's own email (very few per hour on the free plan)
    return !error;
  } catch (e) { console.error('password reset', e.message); return false; }
}
