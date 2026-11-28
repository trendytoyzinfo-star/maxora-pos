import { createClient } from '@supabase/supabase-js';
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabase = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
// New photos are full Cloudinary addresses (f_auto,q_auto = smaller files); older ones are paths in Supabase.
export const imgUrl = (p) => {
  if (!p) return '/placeholder.svg';
  if (/^https:/i.test(p)) return p.replace('/image/upload/', '/image/upload/f_auto,q_auto/');
  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${p}`;
};
