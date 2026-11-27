import PolicyPage from '@/components/PolicyPage';
import { BIZ } from '@/lib/business';
export const metadata = { title: 'Shipping Policy' };
export default function Page() {
  return (
    <PolicyPage title="Shipping Policy">
      <p>We deliver across India through courier partners.</p>
      <h2>Dispatch and delivery</h2>
      <p>Orders are dispatched in {BIZ.dispatchDays}. Delivery usually takes {BIZ.deliveryDays} after dispatch, depending on your location. Remote areas may take longer.</p>
      <h2>Shipping charges</h2>
      <p>One shipping charge applies per order (the highest among the items in your cart). Shipping is free above the amount shown at checkout, when offered.</p>
      <h2>Tracking</h2>
      <p>When your order ships, the courier name and tracking number appear on your order page.</p>
      <h2>Wrong address or failed delivery</h2>
      <p>Please enter a complete address and a working mobile number. If delivery fails because of a wrong address or an unreachable number, re-shipping charges may apply.</p>
      <h2>Damaged parcels</h2>
      <p>If anything is damaged or wrong, request a return from your order page within {BIZ.returnHours} hours of delivery, with a reason and clear photos. A video of opening the parcel helps. See the Refund &amp; Return Policy.</p>
    </PolicyPage>
  );
}
