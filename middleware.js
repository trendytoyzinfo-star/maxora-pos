import { NextResponse } from 'next/server';
// Keeps customers logged in: when the 1-hour login token has expired, trade the refresh token for a new one.
const AT = 'tt_at', RT = 'tt_rt';
const exp = (t) => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch { return 0; } };
const opts = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };
export async function middleware(req) {
  const at = req.cookies.get(AT)?.value, rt = req.cookies.get(RT)?.value;
  if (!rt || (at && exp(at) > Date.now() + 60000)) return NextResponse.next();
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) });
    if (r.ok) {
      const s = await r.json();
      req.cookies.set(AT, s.access_token); req.cookies.set(RT, s.refresh_token);
      const res = NextResponse.next({ request: { headers: req.headers } });
      res.cookies.set(AT, s.access_token, { ...opts, maxAge: s.expires_in || 3600 }); res.cookies.set(RT, s.refresh_token, { ...opts, maxAge: 60 * 60 * 24 * 30 });
      return res;
    }
    if (r.status >= 400 && r.status < 500) { req.cookies.delete(AT); req.cookies.delete(RT); const res = NextResponse.next({ request: { headers: req.headers } }); res.cookies.delete(AT); res.cookies.delete(RT); return res; }
  } catch { /* try again on the next request */ }
  return NextResponse.next();
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'] };
