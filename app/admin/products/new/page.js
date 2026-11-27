import Link from 'next/link';
import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import Flash from '@/components/Flash';
import ProductForm from '@/components/ProductForm';
import { createProduct } from '../../actions';
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams;
  const { data: cats } = await admin().from('categories').select('id,name').order('sort_order');
  return <div><p><Link className="link" href="/admin/products">← All products</Link></p><h1>Add a toy</h1><Flash sp={sp} /><ProductForm categories={cats || []} action={createProduct} label="Add toy" /></div>;
}
