import { getAdmin } from '@/lib/adminAuth';
import { logout } from './actions';
import { admin } from '@/lib/supabaseAdmin';
import { adminCounts } from '@/lib/adminCounts';
import AdminNav from '@/components/AdminNav';
export const metadata = { title: 'Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }) {
  const a = await getAdmin();
  const counts = a ? await adminCounts(admin()) : { orders: 0, returns: 0 };
  return (
    <div className={a ? 'adm adm-root adm-shell' : 'wrap adm adm-root'}>
      {a && <AdminNav initial={counts}><form action={logout}><button className="link" type="submit" title={a.email}>Log out</button></form></AdminNav>}
      {a ? <div className="adm-main">{children}</div> : children}
    </div>
  );
}
