import { createClient } from '@supabase/supabase-js';
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabase = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
export const imgUrl = (p) => (p ? `${SUPABASE_URL}/storage/v1/object/public/product-images/${p}` : '/placeholder.svg');
