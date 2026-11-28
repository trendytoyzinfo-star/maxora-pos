'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
// The admin menu, in groups. Orders and Returns show a small red number: how many are NEW and not looked at yet.
const GROUPS = [
  ['Daily work', [['Dashboard', '/admin'], ['Orders', '/admin/orders', 'orders'], ['Returns', '/admin/returns', 'returns'], ['Payment issues', '/admin/payments']]],
  ['Toys', [['Products', '/admin/products'], ['Inventory', '/admin/inventory'], ['Categories', '/admin/categories']]],
  ['Marketing', [['Offers', '/admin/coupons'], ['Banners', '/admin/banners'], ['Photos', '/admin/photos']]],
  ['Customers', [['Customers', '/admin/customers'], ['Accounts', '/admin/accounts']]],
  ['Store', [['Reports', '/admin/reports'], ['Couriers', '/admin/couriers'], ['Site', '/admin/site'], ['Settings', '/admin/settings']]],
];
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
  const on = (href) => (href === '/admin' ? path === href : path === href || path.startsWith(href + '/'));
  return (
    <nav className="adm-nav" aria-label="Admin menu">
      <div className="adm-brand">TrendyToyz <span>Admin</span></div>
      {GROUPS.map(([title, links]) => <div className="adm-group" key={title}><small>{title}</small>
        {links.map(([label, href, key]) => <Link key={href} href={href} className={on(href) ? 'on' : ''} aria-current={on(href) ? 'page' : undefined}>{label}{key && n[key] > 0 && <b className="nb" aria-label={`${n[key]} new`}>{n[key]}</b>}</Link>)}
      </div>)}
      <div className="adm-foot"><Link href="/">View store</Link>{children}</div>
    </nav>
  );
}
