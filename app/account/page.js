import Link from 'next/link';
import { redirect } from 'next/navigation';
import { admin } from '@/lib/supabaseAdmin';
import { getCustomer } from '@/lib/customerAuth';
import { inr } from '@/lib/format';
import { logout } from './actions';
export const metadata = { title: 'My account', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function Page() {
  const u = await getCustomer();
  if (!u) redirect('/login?next=/account');
  const { data: orders } = await admin().from('orders').select('id,order_number,created_at,status,total,payment_method,payment_status,access_token').eq('user_id', u.id).order('created_at', { ascending: false }).limit(100);
  return (
    <div className="wrap" style={{ padding: '36px 24px 56px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div><h1 style={{ margin: 0 }}>My orders</h1><div className="muted">{u.name ? u.name + ' · ' : ''}{u.email}</div></div>
        <form action={logout}><button className="btn ghost" type="submit">Log out</button></form></div>
      {(orders || []).map((o) => (
        <Link key={o.id} href={`/order/${o.id}?t=${o.access_token}`} className="box" style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
          <div><b>{o.order_number}</b><div className="muted">{new Date(o.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</div></div>
          <span className={'tag ' + o.status}>{o.status}</span><b>{inr(o.total)}</b></Link>))}
      {!orders?.length && <div className="empty">You have no orders yet. <Link href="/products" className="link">Shop all toys</Link></div>}
    </div>
  );
}
