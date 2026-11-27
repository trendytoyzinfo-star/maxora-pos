'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
// The reset link opens this page with a one-time token after the "#". The browser reads it, then sends it to our server with the new password.
export default function ResetPage() {
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, '')), qs = new URLSearchParams(window.location.search);
    if (qs.get('token_hash')) setToken('h:' + qs.get('token_hash'));   // link from our email or from the Supabase email template
    else if (h.get('access_token') && h.get('type') === 'recovery') setToken('a:' + h.get('access_token'));
    else if (h.get('error_description')) setErr(h.get('error_description').replace(/\+/g, ' ') + ' Please ask for a new link.');
    try { history.replaceState(null, '', window.location.pathname); } catch {}
    setReady(true);
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (pw.length < 8) return setErr('Password must be at least 8 characters.');
    if (pw !== pw2) return setErr('The two passwords are not the same.');
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(token.startsWith('h:') ? { token_hash: token.slice(2), password: pw } : { access_token: token.slice(2), password: pw }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d.error || 'Could not change the password. Please ask for a new link.'); else setDone(true);
    } catch { setErr('Network problem. Please try again.'); }
    setBusy(false);
  }
  if (!ready) return <div className="wrap empty">Loading…</div>;
  return (
    <div className="wrap" style={{ padding: '36px 24px 56px' }}>
      <div className="box adm-form" style={{ maxWidth: 440, margin: '0 auto' }}>
        <h1 style={{ margin: 0 }}>Choose a new password</h1>
        {done ? <><p className="ok">Your password was changed. You can log in now.</p><Link className="btn" href="/login">Log in</Link></>
          : !token ? <><p className="bad">{err || 'This link is not valid or has expired.'}</p><Link className="btn" href="/forgot-password">Get a new link</Link></>
            : <form onSubmit={submit} className="adm-form" style={{ padding: 0, border: 0 }}>
              <label>New password (at least 8 characters)<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} maxLength={72} required autoComplete="new-password" /></label>
              <label>Type it again<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} maxLength={72} required autoComplete="new-password" /></label>
              {err && <div className="bad" role="alert">{err}</div>}
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Please wait…' : 'Save new password'}</button>
            </form>}
      </div>
    </div>
  );
}
