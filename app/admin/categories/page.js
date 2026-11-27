import Link from 'next/link';
import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { imgUrl } from '@/lib/supabase';
import { isUuid } from '@/lib/validate';
import Flash from '@/components/Flash';
import ImagePicker from '@/components/ImagePicker';
import Switch from '@/components/Switch';
import { saveCategory, deleteCategory } from '../actions';
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams, db = admin();
  const { data: rows } = await db.from('categories').select('*').order('sort_order');
  const { data: prods } = await db.from('products').select('category_id').limit(2000);
  const count = {}; for (const p of prods || []) count[p.category_id || 'none'] = (count[p.category_id || 'none'] || 0) + 1;
  const edit = isUuid(sp.edit) ? (rows || []).find((c) => c.id === sp.edit) : null;
  return (
    <div><h1>Categories</h1><Flash sp={sp} />
      <form action={saveCategory} className="fs cat-form" key={edit?.id || 'new'}><h3>{edit ? `Edit: ${edit.name}` : 'Add a category'}</h3>
        {edit && <input type="hidden" name="id" value={edit.id} />}
        <div className="g2"><label>Name *<input name="name" required maxLength={60} defaultValue={edit?.name || ''} placeholder="Example: Die Cast Models" /></label><label>Order<input name="sort_order" type="number" step="1" defaultValue={edit?.sort_order ?? (rows?.length || 0) + 1} /><small className="muted">1 shows first</small></label></div>
        <Switch name="is_active" label="Visible in the store" hint="Turn off to hide this category" defaultChecked={edit ? edit.is_active : true} />
        <div><div className="lbl">Picture {edit?.image_path ? '(choose a new one to replace)' : ''}</div>{edit?.image_path && <img src={imgUrl(edit.image_path)} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, marginBottom: 8 }} />}<ImagePicker name="image" multiple={false} /></div>
        <div className="row"><button className="btn" type="submit">{edit ? 'Save category' : 'Add category'}</button>{edit && <Link href="/admin/categories" className="btn ghost">Cancel</Link>}</div></form>
      <p className="muted">{count.none || 0} toys are Non-categorised. <Link className="link" href="/admin/products?cat=none">Show them</Link></p>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th></th><th>Name</th><th>Toys</th><th>Order</th><th>Visible</th><th></th></tr></thead><tbody>
        {(rows || []).map((c) => <tr key={c.id}><td>{c.image_path ? <img src={imgUrl(c.image_path)} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }} /> : null}</td><td><b>{c.name}</b><div className="muted">/{c.slug}</div></td><td>{count[c.id] || 0}</td><td>{c.sort_order}</td><td>{c.is_active ? 'Yes' : 'No'}</td>
          <td><div className="row"><Link className="link" href={`/admin/categories?edit=${c.id}`}>Edit</Link><form action={deleteCategory}><input type="hidden" name="id" value={c.id} /><button className="link" type="submit">Delete</button></form></div></td></tr>)}
      </tbody></table></div></div>
  );
}
