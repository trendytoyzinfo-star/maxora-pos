// SERVER ONLY. Uses the secret key, which can bypass all security rules.
// Import this file only from app/api/** routes or server components. Never from a 'use client' file.
import { createClient } from '@supabase/supabase-js';

export function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
