'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
// The admin menu. Orders and Returns show a small red number: how many are NEW and not looked at yet.
const LINKS = [['Dashboard', '/admin'], ['Orders', '/admin/orders', 'orders'], ['Products', '/admin/products'], ['Inventory', '/admin/inventory'], ['Banners', '/admin/banners'], ['Categories', '/admin/categories'], ['Offers', '/admin/coupons'], ['Customers', '/admin/customers'], ['Accounts', '/admin/accounts'], ['Reports', '/admin/reports'], ['Returns', '/admin/returns', 'returns'], ['Couriers', '/admin/couriers'], ['Payment issues', '/admin/payments'], ['Site', '/admin/site'], ['Settings', '/admin/settings']];
export default function AdminNav({ initial, children }) {
  const [n, setN] = useState(initial);
  const path = usePathname();
  const load = () => fetch('/admin/counts', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setN({ orders: d.orders || 0, returns: d.returns || 0 })).catch(() => {});
  useEffect(() => { setN(initial); }, [initial.orders, initial.returns]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [path]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    window.addEventListener('tt-seen', load);
    return () => { clearInterval(t); window.removeEventListener('tt-seen', load); };
  }, []);
  return (
    <nav className="adm-nav">
      {LINKS.map(([label, href, key]) => <Link key={href} href={href}>{label}{key && n[key] > 0 && <b className="nb" aria-label={`${n[key]} new`}>{n[key]}</b>}</Link>)}
      {children}
    </nav>
  );
}
