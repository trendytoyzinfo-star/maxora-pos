import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import Flash from '@/components/Flash';
import Switch from '@/components/Switch';
import { imgUrl } from '@/lib/supabase';
import { BIZ } from '@/lib/business';
import { saveSite } from '../actions';
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams;
  const { data: s, error } = await admin().from('store_settings').select('announcement_text,announcement_link,announcement_active,favicon_path,store_info').eq('id', 1).maybeSingle();
  const i = s?.store_info || {};
  const F = ({ k, label, hint, max = 100 }) => <label>{label}<input name={'info_' + k} maxLength={max} defaultValue={i[k] || ''} placeholder={BIZ[k] && !String(BIZ[k]).startsWith('YOUR') ? BIZ[k] : hint || ''} /></label>;
  return (
    <div><h1>Site</h1><Flash sp={sp} />
      {error && <div className="bad">Could not load. Run 06_offers_email_site.sql in Supabase first.</div>}
      <form action={saveSite} className="box adm-form">
        <h3>Announcement bar</h3>
        <p className="muted" style={{ margin: 0 }}>A thin bar at the very top of every page. Only write things that are true and that you can prove (do not claim “certified” or “child-safe” without the certificate).</p>
        <Switch name="announcement_active" label="Show the bar" defaultChecked={!!s?.announcement_active} />
        <label>Text (up to 140 letters)<input name="announcement_text" maxLength={140} defaultValue={s?.announcement_text || ''} placeholder="Free shipping on orders above ₹499" /></label>
        <label>Link when tapped (optional, like /products or https://…)<input name="announcement_link" maxLength={300} defaultValue={s?.announcement_link || ''} /></label>

        <h3>Favicon (the small icon in the browser tab)</h3>
        {s?.favicon_path && <div><img src={imgUrl(s.favicon_path)} alt="Current favicon" width={48} height={48} style={{ borderRadius: 8 }} /><label className="chk"><input type="checkbox" name="remove_favicon" /> Remove it</label></div>}
        <label>Upload a square picture (PNG, JPG or WebP, under 3 MB; 512 × 512 is best)<input name="favicon" type="file" accept="image/png,image/jpeg,image/webp" /></label>

        <h3>Store details</h3>
        <p className="muted" style={{ margin: 0 }}>Shown in the footer, Contact, Terms, Privacy Policy and on invoices. Razorpay checks that these match your KYC. Leave a box empty to use the default.</p>
        <F k="legalName" label="Legal / proprietor name (as on your PAN / bank account)" hint="Your full name" />
        <F k="address" label="Business address" max={220} />
        <div className="two"><F k="gstin" label="GSTIN (leave empty if not registered)" /><F k="grievanceOfficer" label="Grievance officer name" hint="Your name" /></div>
        <div className="two"><F k="email" label="Support email" /><F k="whatsapp" label="WhatsApp number" /></div>
        <F k="hours" label="Support hours" />
        <button className="btn" type="submit">Save</button>
      </form>
    </div>
  );
}
