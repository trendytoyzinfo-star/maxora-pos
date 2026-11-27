import { cache } from 'react';
import { supabase } from './supabase';
import { withRule } from './priceRules';
const SEL = 'id,name,slug,price,mrp,stock,is_featured,variants,shipping_charge,category_id,categories(name,slug),product_images(storage_path,sort_order)';
// Timed price changes that an admin switched on (empty if the table does not exist yet).
async function getRules() {
  const { data } = await supabase.from('price_rules').select('id,scope,category_id,product_id,direction,mode,value,starts_at,ends_at,created_at').eq('is_active', true);
  return data || [];
}
export const sortedImages = (p) => [...(p.product_images || [])].sort((a, b) => a.sort_order - b.sort_order).map((i) => i.storage_path);
export async function getCategories() {
  const { data } = await supabase.from('categories').select('id,name,slug,image_path').eq('is_active', true).order('sort_order');
  return data || [];
}
export async function getProducts({ category, q, sort, limit, featured } = {}) {
  let query = supabase.from('products').select(SEL).eq('status', 'active');
  if (category) {
    const { data: c } = await supabase.from('categories').select('id').eq('slug', category).maybeSingle();
    if (!c) return [];
    query = query.eq('category_id', c.id);
  }
  if (q) query = query.ilike('name', `%${q.replace(/[%,]/g, ' ')}%`);
  if (featured) query = query.eq('is_featured', true);
  const [col, asc] = { new: ['created_at', false], low: ['price', true], high: ['price', false] }[sort] || ['created_at', false];
  query = query.order(col, { ascending: asc });
  if (limit) query = query.limit(limit);
  const [{ data }, rules] = await Promise.all([query, getRules()]);
  return (data || []).map((p) => withRule(p, rules));
}
// True if the shopper can buy it. Toys with options (variants) keep their stock inside each option.
export const available = (p) => { const v = (p.variants || []).filter((x) => x.is_active !== false); return v.length ? v.some((x) => Number(x.stock) > 0) : p.stock > 0; };
export const getProduct = cache(async (slug) => {
  const [{ data }, rules] = await Promise.all([supabase.from('products').select('*, categories(name,slug), product_images(storage_path,sort_order)').eq('slug', slug).maybeSingle(), getRules()]);
  return data ? withRule(data, rules) : data;
});
export async function getBanners() {
  const { data } = await supabase.from('banners').select('id,title,subtitle,button_text,link_url,image_path').eq('is_active', true).order('sort_order');
  return data || [];
}
