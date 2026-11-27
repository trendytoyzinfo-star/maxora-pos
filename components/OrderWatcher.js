'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from './CartProvider';

// Empties the cart only once this order is really placed (COD) or paid (online), and only for the order this browser just made.
export default function OrderWatcher({ orderId, done, waiting }) {
  const { clear, ready } = useCart();
  const router = useRouter();
  useEffect(() => {
    if (!ready || !done) return;
    try { if (localStorage.getItem('tt_pending_order') === orderId) { clear(); localStorage.removeItem('tt_pending_order'); } } catch {}
  }, [ready, done, orderId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // while the payment is being confirmed, re-check every 4 seconds for about 2 minutes
    if (!waiting) return;
    let n = 0; const t = setInterval(() => { if (++n > 30) clearInterval(t); else router.refresh(); }, 4000);
    return () => clearInterval(t);
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
