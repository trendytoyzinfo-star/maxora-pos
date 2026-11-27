import Link from 'next/link';
import { notFound } from 'next/navigation';
import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { isUuid } from '@/lib/validate';
import Flash from '@/components/Flash';
import ProductForm from '@/components/ProductForm';
import { saveProduct } from '../../actions';
export default async function Page({ params, searchParams }) {
  await requireAdmin();
  const { id } = await params; const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const db = admin();
  const [{ data: p }, { data: cats }, { data: imgs }] = await Promise.all([
    db.from('products').select('*').eq('id', id).maybeSingle(),
    db.from('categories').select('id,name').order('sort_order'),
    db.from('product_images').select('id,storage_path,sort_order').eq('product_id', id).order('sort_order'),
  ]);
  if (!p) notFound();
  return <div><p><Link className="link" href="/admin/products">← All products</Link></p><h1>{p.name}</h1><Flash sp={sp} /><ProductForm p={p} categories={cats || []} images={imgs || []} action={saveProduct} label="Save changes" /></div>;
}
