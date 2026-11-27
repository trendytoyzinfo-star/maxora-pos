import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import Flash from '@/components/Flash';
import Switch from '@/components/Switch';
import { saveSettings } from '../actions';
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams;
  const { data: s } = await admin().from('store_settings').select('cod_enabled,free_shipping_above').eq('id', 1).maybeSingle();
  return (
    <div><h1>Settings</h1><Flash sp={sp} />
      <form action={saveSettings} className="box adm-form">
        <Switch name="cod_enabled" label="Cash on delivery" hint="Available in the store" defaultChecked={!!s?.cod_enabled} />
        <p className="muted">This is the master switch. COD shows for a toy only when this is ON and that toy's own COD setting is ON (Products → edit toy).</p>
        <label>Free shipping above (₹). Leave empty for none.<input name="free_shipping_above" type="number" min="0" step="1" defaultValue={s?.free_shipping_above ?? ''} /></label>
        <button className="btn" type="submit">Save</button></form></div>
  );
}
