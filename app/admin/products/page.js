import Link from 'next/link';
import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { inr } from '@/lib/format';
import Flash from '@/components/Flash';
import { imgUrl } from '@/lib/supabase';
import ConfirmButton from '@/components/ConfirmButton';
import { deleteProduct } from '../actions';
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams, db = admin();
  const term = (typeof sp.q === 'string' ? sp.q : '').replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 40), cat = typeof sp.cat === 'string' ? sp.cat : '';
  const { data: cats } = await db.from('categories').select('id,name').order('sort_order');
  let q = db.from('products').select('id,name,sku,price,stock,status,cod_enabled,variants,category_id,categories(name),product_images(storage_path,sort_order)').order('created_at', { ascending: false }).limit(500);
  if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  if (cat === 'none') q = q.is('category_id', null); else if (cat) q = q.eq('category_id', cat);
  const { data: rows, error } = await q;
  const photo = (p) => [...(p.product_images || [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path;
  const stock = (p) => (Array.isArray(p.variants) && p.variants.length ? p.variants.reduce((n, v) => n + (v.is_active === false ? 0 : Number(v.stock) || 0), 0) : p.stock);
  return (
    <div><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}><h1>Products</h1><Link href="/admin/products/new" className="btn">Add toy</Link></div><Flash sp={sp} />
      <form action="/admin/products" className="two" style={{ alignItems: 'flex-end', maxWidth: 640 }}>
        <label>Search name or SKU<input name="q" defaultValue={term} /></label>
        <label>Category<select name="cat" defaultValue={cat}><option value="">All categories</option><option value="none">Non-categorised</option>{(cats || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button className="btn" type="submit" style={{ minHeight: 44 }}>Filter</button></form>
      {error && <div className="bad">Could not load products.</div>}
      <p className="muted">{rows?.length || 0} toys shown</p>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>COD</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {(rows || []).map((p) => <tr key={p.id}><td><div className="pn"><img src={imgUrl(photo(p))} alt="" /><div><Link className="link" href={`/admin/products/${p.id}`}>{p.name}</Link>{p.sku && <div className="muted">SKU: {p.sku}</div>}</div></div></td><td>{p.categories?.name || <span className="bad">Non-categorised</span>}</td><td>{inr(p.price)}</td><td>{stock(p)}</td><td>{p.cod_enabled ? 'On' : 'Off'}</td><td><span className="tag">{p.status}</span></td><td><div className="acts"><Link className="btn ghost sm" href={`/admin/products/${p.id}`}>Edit</Link>
          <form action={deleteProduct}><input type="hidden" name="id" value={p.id} /><ConfirmButton className="btn danger sm" message={`Delete "${p.name}" for good? Offers made only for this toy are removed too.`}>Delete</ConfirmButton></form></div></td></tr>)}
      </tbody></table></div></div>
  );
}
