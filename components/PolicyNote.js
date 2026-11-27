import Link from 'next/link';
import { BIZ } from '@/lib/business';
// Short reminder of the cancel / return rules. Used on product, cart, checkout and order pages.
export default function PolicyNote({ className = 'policy-note' }) {
  return (
    <div className={className}>
      <b>Cancel &amp; return policy</b>
      <ul>
        <li>Cancel any time <b>before your order is shipped</b>.</li>
        <li>Returns only within <b>{BIZ.returnHours} hours of delivery</b>, and only for a damaged item, wrong item or wrong size.</li>
        <li>A reason and clear photos are required. We review every request and accept or reject it.</li>
      </ul>
      <Link href="/refund-policy" className="link">Read full policy</Link>
    </div>
  );
}
