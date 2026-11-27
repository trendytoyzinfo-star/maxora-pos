import Link from 'next/link';
import Flash from '@/components/Flash';
import { getBiz } from '@/lib/storeInfo';
import { requestReset } from '../account/actions';
export const metadata = { title: 'Forgot password', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }) {
  const sp = await searchParams, biz = await getBiz();
  return (
    <div className="wrap" style={{ padding: '36px 24px 56px' }}>
      <form action={requestReset} className="box adm-form" style={{ maxWidth: 440, margin: '0 auto' }}>
        <h1 style={{ margin: 0 }}>Forgot your password?</h1>
        <p className="muted" style={{ margin: 0 }}>Enter the email you used to create your account. We will send you a link to choose a new password.</p>
        <Flash sp={sp} />
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <button className="btn" type="submit">Send reset link</button>
        <p className="muted" style={{ margin: 0 }}>Do not have access to that email? WhatsApp us on <b>{biz.whatsapp}</b> with your registered mobile number and an order number, and we will help you get back in.</p>
        <p className="muted" style={{ margin: 0 }}><Link className="link" href="/login">Back to log in</Link></p>
      </form>
    </div>
  );
}
