import Link from 'next/link';
import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { imgUrl } from '@/lib/supabase';
import { isUuid } from '@/lib/validate';
import Flash from '@/components/Flash';
import ImagePicker from '@/components/ImagePicker';
import Switch from '@/components/Switch';
import ConfirmButton from '@/components/ConfirmButton';
import { saveBanner, deleteBanner, toggleBanner } from '../actions';
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams;
  const { data: rows, error } = await admin().from('banners').select('*').order('sort_order');
  const edit = isUuid(sp.edit) ? (rows || []).find((b) => b.id === sp.edit) : null;
  return (
    <div><h1>Banners</h1><Flash sp={sp} />
      {error && <div className="bad">Could not load banners. Run the 05_banners_inventory.sql file in Supabase first.</div>}
      <p className="muted">These slide on the home page. With 2 or more active banners they change by themselves every 5 seconds. Best picture size: 1600 × 600 pixels (wide).</p>
      <form action={saveBanner} className="fs cat-form" style={{ maxWidth: 720 }} key={edit?.id || 'new'}><h3>{edit ? 'Edit banner' : 'Add a banner'}</h3>
        {edit && <input type="hidden" name="id" value={edit.id} />}
        <div><div className="lbl">Picture {edit ? '(choose a new one to replace)' : '*'}</div>{edit && <img src={imgUrl(edit.image_path)} alt="" style={{ width: 240, borderRadius: 10, marginBottom: 8 }} />}<ImagePicker name="image" multiple={false} maxSize={1920} required={!edit} /></div>
        <div className="g2"><label>Heading (optional)<input name="title" maxLength={80} defaultValue={edit?.title || ''} /></label><label>Small text (optional)<input name="subtitle" maxLength={140} defaultValue={edit?.subtitle || ''} /></label></div>
        <div className="g2"><label>Button text (optional)<input name="button_text" maxLength={30} placeholder="Shop now" defaultValue={edit?.button_text || ''} /></label><label>Link (optional)<input name="link_url" maxLength={300} placeholder="/products or /products?category=die-cast-models" defaultValue={edit?.link_url || ''} /></label></div>
        <div className="g2"><label>Order<input name="sort_order" type="number" step="1" defaultValue={edit?.sort_order ?? (rows?.length || 0) + 1} /><small className="muted">1 shows first</small></label>
          <Switch name="is_active" label="Show on the home page" defaultChecked={edit ? edit.is_active : true} /></div>
        <div className="row"><button className="btn" type="submit">{edit ? 'Save banner' : 'Add banner'}</button>{edit && <Link href="/admin/banners" className="btn ghost">Cancel</Link>}</div></form>
      <div className="tbl-wrap" style={{ marginTop: 16 }}><table className="tbl"><thead><tr><th>Picture</th><th>Text</th><th>Order</th><th>Showing</th><th></th></tr></thead><tbody>
        {(rows || []).map((b) => <tr key={b.id}><td><img src={imgUrl(b.image_path)} alt="" style={{ width: 160, borderRadius: 8 }} /></td>
          <td><b>{b.title || '—'}</b><div className="muted">{b.subtitle}{b.link_url && <><br />Link: {b.link_url}</>}</div></td><td>{b.sort_order}</td><td>{b.is_active ? 'Yes' : 'No'}</td>
          <td><div className="acts"><Link className="btn sm ghost" href={`/admin/banners?edit=${b.id}`}>Edit</Link>
            <form action={toggleBanner}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="on" value={b.is_active ? '0' : '1'} /><button className="btn sm ghost" type="submit">{b.is_active ? 'Hide' : 'Show'}</button></form>
            <form action={deleteBanner}><input type="hidden" name="id" value={b.id} /><ConfirmButton className="btn sm danger" message="Delete this banner?">Delete</ConfirmButton></form></div></td></tr>)}
        {!rows?.length && <tr><td colSpan={5} className="muted">No banners yet.</td></tr>}
      </tbody></table></div></div>
  );
}
