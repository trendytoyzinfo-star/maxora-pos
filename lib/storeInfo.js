// SERVER ONLY. Store details (legal name, address, grievance officer ...). The values typed in Admin -> Site win;
// anything left empty there falls back to lib/business.js.
import { admin } from '@/lib/supabaseAdmin';
import { BIZ } from '@/lib/business';
export const INFO_KEYS = ['legalName', 'address', 'gstin', 'email', 'whatsapp', 'hours', 'grievanceOfficer'];
const ok = (b) => !b.legalName.startsWith('YOUR') && !b.address.startsWith('YOUR') && !b.grievanceOfficer.startsWith('YOUR');
export async function getBiz() {
  const biz = { ...BIZ };
  try {
    const { data } = await admin().from('store_settings').select('store_info').eq('id', 1).maybeSingle();
    const i = data?.store_info || {};
    for (const k of INFO_KEYS) if (typeof i[k] === 'string' && i[k].trim()) biz[k] = i[k].trim();
  } catch { /* use the defaults */ }
  biz.configured = ok(biz);
  return biz;
}
