import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import Flash from '@/components/Flash';
import { addCourier, toggleCourier } from '../actions';
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams;
  const { data: rows } = await admin().from('couriers').select('*').order('sort_order').order('name');
  return (
    <div><h1>Couriers</h1><Flash sp={sp} />
      <p className="muted">These appear in the dropdown when you ship an order. Use <b>{'{AWB}'}</b> in the link where the tracking number goes.</p>
      <form action={addCourier} className="box adm-form"><h3>Add a courier</h3>
        <label>Name<input name="name" required maxLength={60} /></label>
        <label>Tracking link (optional), e.g. https://example.com/track/{'{AWB}'}<input name="tracking_url_template" maxLength={300} /></label>
        <button className="btn" type="submit">Add courier</button></form>
      <div className="tbl-wrap" style={{ marginTop: 16 }}><table className="tbl"><thead><tr><th>Courier</th><th>Tracking link</th><th>In dropdown</th></tr></thead><tbody>
        {(rows || []).map((c) => <tr key={c.id}><td><b>{c.name}</b></td><td className="muted">{c.tracking_url_template || 'No link (customer sees only the number)'}</td>
          <td><form action={toggleCourier}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="on" value={c.is_active ? '0' : '1'} /><button className="btn ghost" style={{ minHeight: 36, padding: '0 14px' }} type="submit">{c.is_active ? 'Yes → hide' : 'No → show'}</button></form></td></tr>)}
      </tbody></table></div></div>
  );
}
