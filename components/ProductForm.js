import ImagePicker from './ImagePicker';
import Switch from './Switch';
import { imgUrl } from '@/lib/supabase';
// One form for "Add toy" and "Edit toy". Server component: no client state needed.
export default function ProductForm({ p, categories, images = [], action, label }) {
  const v = p || {}, vs = Array.isArray(v.variants) ? v.variants : [];
  return (
    <form action={action} className="pf">
      {v.id && <input type="hidden" name="id" value={v.id} />}

      <section className="fs"><h3>Basic details</h3>
        <label>Toy name *<input name="name" required minLength={3} maxLength={200} defaultValue={v.name || ''} placeholder="Example: 1:24 Scale RC Drift Car" /></label>
        <label>Short description<input name="short_description" maxLength={300} defaultValue={v.short_description || ''} placeholder="One line shown under the name" /></label>
        <label>Full description<textarea name="description" rows={6} maxLength={5000} defaultValue={v.description || ''} /></label>
        <label>In the box<textarea name="in_package" rows={3} maxLength={1000} defaultValue={v.in_package || ''} placeholder="One item per line" /></label>
      </section>

      <section className="fs"><h3>Photos</h3>
        {images.length > 0 && <div className="imgs">{images.map((i, n) => <figure key={i.id}><img src={imgUrl(i.storage_path)} alt="" />
          <label className="chk"><input type="radio" name="main_image" value={i.id} defaultChecked={n === 0} /> Main photo</label>
          <label className="chk"><input type="checkbox" name={'del_' + i.id} /> Remove</label></figure>)}</div>}
        <ImagePicker />
        <div className="muted">Up to 10 photos. They are shrunk automatically. The main photo shows first in the store.</div>
      </section>

      <section className="fs"><h3>Price</h3>
        <div className="g3"><label>Selling price (₹) *<input name="price" type="number" step="0.01" min="1" required defaultValue={v.price ?? ''} /></label>
          <label>MRP (₹, optional)<input name="mrp" type="number" step="0.01" min="1" defaultValue={v.mrp ?? ''} /></label>
          <label>Shipping charge (₹)<input name="shipping_charge" type="number" step="0.01" min="0" defaultValue={v.shipping_charge ?? 0} /><small className="muted">0 means free shipping</small></label></div>
      </section>

      <section className="fs"><h3>Stock and category</h3>
        <div className="g3"><label>SKU<input name="sku" maxLength={60} defaultValue={v.sku || ''} /></label>
          {vs.length === 0 && <label>Stock *<input name="stock" type="number" min="0" step="1" required defaultValue={v.stock ?? 0} /></label>}
          <label>Category<select name="category_id" defaultValue={v.category_id || ''}><option value="">Non-categorised</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
        {vs.length > 0 && <div><div className="lbl">Options (stock is kept per option)</div>
          {vs.map((x) => <div className="adm-var" key={x.id}><b>{x.name}</b>
            <label>Price<input name={'vp_' + x.id} type="number" step="0.01" min="1" defaultValue={x.price ?? v.price} /></label>
            <label>Stock<input name={'vs_' + x.id} type="number" min="0" step="1" defaultValue={x.stock} /></label>
            <label className="chk"><input type="checkbox" name={'va_' + x.id} defaultChecked={x.is_active !== false} /> Active</label>
            <label className="chk"><input type="checkbox" name={'vx_' + x.id} /> Remove</label></div>)}</div>}
        <details open={vs.length === 0 ? undefined : true} style={{ marginTop: 12 }}><summary className="lbl" style={{ cursor: 'pointer' }}>Add size / colour options (optional)</summary>
          <div className="muted" style={{ margin: '6px 0' }}>Example: name “Red”, price empty (uses the toy price), stock 10. Once a toy has options, stock is kept for each option and the Stock box above is not used.</div>
          {[1, 2, 3, 4, 5].map((n) => <div className="adm-var" key={n}>
            <label>Option name<input name={'nv_name_' + n} maxLength={60} placeholder={n === 1 ? 'Red' : ''} /></label>
            <label>Price (optional)<input name={'nv_price_' + n} type="number" step="0.01" min="1" /></label>
            <label>Stock<input name={'nv_stock_' + n} type="number" min="0" step="1" defaultValue="0" /></label></div>)}
        </details>
      </section>

      <section className="fs"><h3>More details</h3>
        <div className="g3"><label>Age group<input name="age_group" maxLength={40} placeholder="3+ years" defaultValue={v.age_group || ''} /></label>
          <label>Brand<input name="brand" maxLength={60} defaultValue={v.brand || 'TrendyToyz'} /></label>
          <label>Tags<input name="tags" maxLength={300} placeholder="rc car, remote, gift" defaultValue={(v.tags || []).join(', ')} /></label></div>
      </section>

      <section className="fs"><h3>Visibility</h3>
        <label>Status<select name="status" defaultValue={v.status || 'active'}><option value="active">Active (visible in store)</option><option value="draft">Draft (hidden)</option><option value="archived">Archived (hidden)</option></select></label>
        <div className="g2"><Switch name="cod_enabled" label="Cash on delivery" hint="Allow COD for this toy" defaultChecked={!!v.cod_enabled} />
          <Switch name="is_featured" label="Show on home page" hint="Featured / best seller" defaultChecked={!!v.is_featured} /></div>
      </section>

      <section className="fs"><h3>Google search (optional)</h3>
        <label>Google title<input name="seo_title" maxLength={70} defaultValue={v.seo_title || ''} placeholder="Up to 70 letters" /></label>
        <label>Google description<textarea name="seo_description" rows={2} maxLength={170} defaultValue={v.seo_description || ''} placeholder="Up to 170 letters" /></label>
      </section>

      <div className="pf-bar"><button className="btn" type="submit">{label}</button></div>
    </form>
  );
}
