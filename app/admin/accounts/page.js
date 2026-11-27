import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';
import { changeAccountEmail, sendAccountReset } from '../actions';
export const dynamic = 'force-dynamic';
const dt = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—');
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams, db = admin();
  const term = (typeof sp.q === 'string' ? sp.q : '').toLowerCase().trim().slice(0, 60);
  let users = [], failed = false;
  if (term) {
    try {
      for (let page = 1; page <= 5; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (error) { failed = true; break; }
        users.push(...(data?.users || []));
        if ((data?.users || []).length < 200) break;
      }
    } catch { failed = true; }
    users = users.filter((u) => `${u.email || ''} ${u.user_metadata?.name || ''} ${u.user_metadata?.phone || ''}`.toLowerCase().includes(term)).slice(0, 20);
  }
  return (
    <div><h1>Customer accounts</h1><Flash sp={sp} />
      <div className="box"><b>Customer cannot get into his account?</b> Most can use “Forgot your password?” on the login page. If he <b>no longer has that email</b>, first check it is really him (WhatsApp: ask for his registered mobile number, an order number and the delivery address of that order). Then change his login email here: we send the password reset link to the new email.</div>
      <form action="/admin/accounts" className="two" style={{ alignItems: 'flex-end', maxWidth: 520 }}><label>Search email, name or mobile<input name="q" defaultValue={term} required /></label><button className="btn" type="submit" style={{ minHeight: 44 }}>Search</button></form>
      {failed && <div className="bad">Could not load accounts.</div>}
      {term && !users.length && !failed && <p className="muted">No account found.</p>}
      <div className="ret-list">
        {users.map((u) => (
          <div className="box ret" key={u.id}>
            <div><b>{u.user_metadata?.name || '—'}</b> · {u.email}<div className="muted">Mobile {u.user_metadata?.phone || '—'} · created {dt(u.created_at)} · last login {dt(u.last_sign_in_at)}</div></div>
            <form action={sendAccountReset} className="ret-f"><input type="hidden" name="email" value={u.email} /><button className="btn ghost" type="submit">Send reset link to {u.email}</button></form>
            <form action={changeAccountEmail} className="ret-f"><input type="hidden" name="id" value={u.id} />
              <input name="email" type="email" required placeholder="New login email" maxLength={120} />
              <ConfirmButton className="btn" message="Change this customer's login email? Only do this after you have checked it is really him.">Change email and send reset link</ConfirmButton></form>
          </div>))}
      </div>
    </div>
  );
}
