'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCart } from './CartProvider';
export default function Header() {
  const { count } = useCart();
  const [me, setMe] = useState(null);
  const path = usePathname();
  // asked again on every page change, so the header changes right after login / logout
  useEffect(() => { fetch('/api/me', { cache: 'no-store' }).then((r) => r.json()).then(setMe).catch(() => {}); }, [path]);
  return (
    <header className="hdr"><div className="wrap hdr-in">
      <Link href="/" className="logo">Trendy<span>Toyz</span></Link>
      <form action="/products" className="search"><input name="q" aria-label="Search toys" placeholder="Search toys, cars, puzzles" /><button type="submit" aria-label="Search"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg></button></form>
      {me && (me.in ? <Link href="/account" className="acct">My orders</Link> : <Link href="/login" className="acct">Log in</Link>)}
      <Link href="/cart" className="cartbtn" aria-label="Cart">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 11.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 7H6" /></svg>
        {count > 0 && <b className="cnt">{count}</b>}
      </Link>
    </div></header>
  );
}
