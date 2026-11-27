import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCustomer, safeNext } from '@/lib/customerAuth';
import Flash from '@/components/Flash';
import { login } from '../account/actions';
export const metadata = { title: 'Log in', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }) {
  const sp = await searchParams, next = safeNext(sp.next, '/account');
  if (await getCustomer()) redirect(next);
  return (
    <div className="wrap" style={{ padding: '36px 24px 56px' }}>
      <form action={login} className="box adm-form" style={{ maxWidth: 440, margin: '0 auto' }}>
        <h1 style={{ margin: 0 }}>Log in</h1>
        {next === '/checkout' && <p className="muted" style={{ margin: 0 }}>Please log in to place your order. Your cart is saved.</p>}
        <Flash sp={sp} /><input type="hidden" name="next" value={next} />
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
        <button className="btn" type="submit">Log in</button>
        <p className="muted" style={{ margin: 0 }}><Link className="link" href="/forgot-password">Forgot your password?</Link></p>
        <p className="muted" style={{ margin: 0 }}>New here? <Link className="link" href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
      </form>
    </div>
  );
}
