import PolicyPage from '@/components/PolicyPage';
import { BIZ } from '@/lib/business';
export const metadata = { title: 'Refund & Return Policy' };
export default function Page() {
  return (
    <PolicyPage title="Refund & Return Policy">
      <h2>Cancellation</h2>
      <p>You can cancel your order yourself from your order page <b>any time before it is shipped</b>. Once an order is shipped it cannot be cancelled. Paid orders that are cancelled are refunded in full within {BIZ.refundDays}.</p>
      <h2>Returns: only within {BIZ.returnHours} hours of delivery</h2>
      <p>A return can be requested <b>only within {BIZ.returnHours} hours after the order is delivered</b>. After that, the return option is closed and requests cannot be accepted.</p>
      <p>Returns are accepted <b>only</b> in these cases:</p>
      <ul><li>The item is damaged or defective.</li><li>A wrong item was delivered (different from what you ordered).</li><li>The wrong size was delivered.</li></ul>
      <h2>How to request a return</h2>
      <p>Open your order page (the link shown after you order) and use the return form. You must choose a reason, describe the problem and upload at least 1 clear photo (up to 4). <b>Requests without a reason or photos are not accepted.</b> We check your request and either accept or reject it. You will see our decision on your order page. A return happens only if we accept it.</p>
      <h2>Not eligible</h2>
      <p>Change of mind, used items, items damaged by the customer, incomplete items or items without original packaging, and any request made after {BIZ.returnHours} hours of delivery.</p>
      <h2>Refunds</h2>
      <p>After an accepted return is received and checked, we refund to the original payment method within {BIZ.refundDays}. For cash on delivery orders we refund to your bank account or UPI after you share the details on WhatsApp {BIZ.whatsapp}.</p>
      <h2>Payment deducted but order not confirmed</h2>
      <p>If money was deducted and the order shows as cancelled or unconfirmed, it is refunded within {BIZ.refundDays}. Contact us at {BIZ.email} if it is not.</p>
      <h2>Invoice</h2>
      <p>A bill (invoice) is available to download from your order page as soon as your order is confirmed.</p>
    </PolicyPage>
  );
}
