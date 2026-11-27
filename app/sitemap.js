import { supabase } from '@/lib/supabase';
import { SITE } from '@/lib/format';
export default async function sitemap() {
  const [{ data: p }, { data: c }] = await Promise.all([supabase.from('products').select('slug,updated_at').eq('status', 'active'), supabase.from('categories').select('slug').eq('is_active', true)]);
  return [{ url: SITE }, { url: `${SITE}/products` },
    ...['contact', 'terms', 'privacy-policy', 'refund-policy', 'shipping-policy'].map((x) => ({ url: `${SITE}/${x}` })),
    ...(c || []).map((x) => ({ url: `${SITE}/products?category=${x.slug}` })),
    ...(p || []).map((x) => ({ url: `${SITE}/product/${x.slug}`, lastModified: x.updated_at }))];
}
