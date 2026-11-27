import Link from 'next/link';
import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { imgUrl } from '@/lib/supabase';
import Flash from '@/components/Flash';
import { setStock, saveLowStock } from '../actions';
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams, db = admin();
  const tab = sp.tab === 'low' ? 'low' : 'all';
  const term = (typeof sp.q === 'string' ? sp.q : '').replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 40), cat = typeof sp.cat === 'string' ? sp.cat : '';
  const [{ data: cats }, { data: st }] = await Promise.all([db.from('categories').select('id,name').order('sort_order'), db.from('store_settings').select('low_stock_threshold').eq('id', 1).maybeSingle()]);
  const th = st?.low_stock_threshold ?? 5;
  let q = db.from('products').select('id,name,sku,stock,status,variants,category_id,categories(name),product_images(storage_path,sort_order)').neq('status', 'archived').order('name').limit(1000);
  if (tab === 'all') { if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`); if (cat === 'none') q = q.is('category_id', null); else if (cat) q = q.eq('category_id', cat); }
  const { data: all } = await q;
  const vsOf = (p) => (Array.isArray(p.variants) ? p.variants.filter((v) => v.is_active !== false) : []);
  const eff = (p) => { const v = vsOf(p); return v.length ? Math.min(...v.map((x) => Number(x.stock) || 0)) : p.stock; };
  const photo = (p) => [...(p.product_images || [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path;
  const lowAll = (all || []).filter((p) => eff(p) <= th);
  const rows = tab === 'low' ? [...lowAll].sort((a, b) => eff(a) - eff(b)) : all || [];
  return (
    <div><h1>Inventory</h1><Flash sp={sp} />
      <div className="pills"><Link href="/admin/inventory?tab=all" className={'pill' + (tab === 'all' ? ' on' : '')}>All products</Link><Link href="/admin/inventory?tab=low" className={'pill' + (tab === 'low' ? ' on' : '')}>Low stock{tab === 'low' || !term ? ` (${lowAll.length})` : ''}</Link></div>
      {tab === 'all' ? <form action="/admin/inventory" className="two" style={{ alignItems: 'flex-end', maxWidth: 640, margin: '10px 0' }}><input type="hidden" name="tab" value="all" />
        <label>Search name or SKU<input name="q" defaultValue={term} /></label>
        <label>Category<select name="cat" defaultValue={cat}><option value="">All categories</option><option value="none">Non-categorised</option>{(cats || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button className="btn" type="submit" style={{ minHeight: 44 }}>Filter</button></form>
        : <form action={saveLowStock} className="row" style={{ alignItems: 'flex-end', margin: '10px 0' }}><label style={{ maxWidth: 220 }}>Alert when stock is this or less<input name="threshold" type="number" min="0" max="1000" step="1" defaultValue={th} /></label><button className="btn" type="submit" style={{ minHeight: 44 }}>Save</button></form>}
      <p className="muted">{rows.length} toys{tab === 'low' ? ` with ${th} or less in stock` : ''}. Change the stock number and press Save in that row.</p>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Toy</th><th>Category</th><th>Stock</th></tr></thead><tbody>
        {rows.map((p) => { const v = vsOf(p), e = eff(p); return <tr key={p.id}>
          <td><div className="pn"><img src={imgUrl(photo(p))} alt="" /><div><Link className="link" href={`/admin/products/${p.id}`}>{p.name}</Link>{p.sku && <div className="muted">SKU: {p.sku}</div>}
            {e === 0 ? <span className="tag cancelled">Out of stock</span> : e <= th ? <span className="tag placed">Low stock</span> : null}{p.status !== 'active' && <span className="tag"> {p.status}</span>}</div></div></td>
          <td>{p.categories?.name || <span className="bad">Non-categorised</span>}</td>
          <td><form action={setStock} className="stk"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="tab" value={tab} /><input type="hidden" name="q" value={term} /><input type="hidden" name="cat" value={cat} />
            {v.length ? v.map((x) => <label key={x.id} className="stk-v">{x.name}<input name={'vs_' + x.id} type="number" min="0" step="1" defaultValue={x.stock} /></label>) : <input name="stock" type="number" min="0" step="1" defaultValue={p.stock} aria-label="Stock" />}
            <button className="btn sm" type="submit">Save</button></form></td></tr>; })}
        {!rows.length && <tr><td colSpan={3} className="muted">{tab === 'low' ? 'All toys have enough stock.' : 'No toys found.'}</td></tr>}
      </tbody></table></div></div>
  );
}
