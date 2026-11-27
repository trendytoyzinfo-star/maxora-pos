import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCustomer, safeNext } from '@/lib/customerAuth';
import Flash from '@/components/Flash';
import { signup } from '../account/actions';
export const metadata = { title: 'Create account', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }) {
  const sp = await searchParams, next = safeNext(sp.next, '/');
  if (await getCustomer()) redirect(next);
  return (
    <div className="wrap" style={{ padding: '36px 24px 56px' }}>
      <form action={signup} className="box adm-form" style={{ maxWidth: 440, margin: '0 auto' }}>
        <h1 style={{ margin: 0 }}>Create your account</h1>
        <Flash sp={sp} /><input type="hidden" name="next" value={next} />
        <label>Full name<input name="name" required maxLength={60} autoComplete="name" /></label>
        <label>Mobile number<input name="phone" required inputMode="numeric" placeholder="10-digit number" autoComplete="tel" /></label>
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password (at least 8 characters)<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></label>
        <button className="btn" type="submit">Create account</button>
        <p className="muted" style={{ margin: 0 }}>Already have an account? <Link className="link" href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link></p>
      </form>
    </div>
  );
}
