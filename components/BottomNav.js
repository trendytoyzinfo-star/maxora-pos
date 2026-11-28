'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from './CartProvider';
// Phone-only bar at the bottom of the screen.
export default function BottomNav() {
  const { count } = useCart();
  const path = usePathname();
  const items = [['Home', '/', 'M3 11l9-8 9 8M5 10v10h14V10'], ['All toys', '/products', 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
    ['Account', '/account', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6'], ['Cart', '/cart', 'M2 3h3l3 12h10l3-8H6M9 20h.01M18 20h.01']];
  return (
    <nav className="bnav" aria-label="Main">{items.map(([label, href, d]) => (
      <Link key={href} href={href} className={path === href ? 'on' : ''}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
        <span>{label}</span>{href === '/cart' && count > 0 && <b className="cnt">{count}</b>}
      </Link>))}</nav>
  );
}
