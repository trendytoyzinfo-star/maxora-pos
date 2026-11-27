import PolicyPage from '@/components/PolicyPage';
import { getBiz } from '@/lib/storeInfo';
export const metadata = { title: 'Terms & Conditions' };
export const revalidate = 300;
export default async function Page() {
  const BIZ = await getBiz();
  return (
    <PolicyPage title="Terms & Conditions">
      <p>{BIZ.brand} is operated by {BIZ.legalName}, {BIZ.address}{BIZ.gstin ? `, GSTIN ${BIZ.gstin}` : ''}. By using this website or placing an order you agree to these terms.</p>
      <h2>Orders</h2>
      <p>An order is accepted when you receive a confirmation on the order page. We may cancel an order if an item is out of stock, a price was shown wrongly, or the address cannot be served. If you had already paid, we refund the full amount.</p>
      <h2>Prices and payment</h2>
      <p>All prices are in Indian Rupees (INR) and include applicable taxes unless stated. Online payments are processed by Razorpay; we never see or store your card, UPI or bank details. Cash on delivery is offered only for eligible items and addresses.</p>
      <h2>Products</h2>
      <p>Product photos are for reference and colours may vary slightly. Toys are for the age group shown on the product page and young children should use them under adult supervision. Small parts can be a choking hazard for children under 3 years.</p>
      <h2>Shipping, returns and refunds</h2>
      <p>See our <a className="link" href="/shipping-policy">Shipping Policy</a> and <a className="link" href="/refund-policy">Refund &amp; Return Policy</a>.</p>
      <h2>Misuse</h2>
      <p>You must not misuse the site, place false orders, or try to interfere with its working. We may refuse service in such cases.</p>
      <h2>Liability</h2>
      <p>To the extent allowed by law, our liability for any order is limited to the amount you paid for it.</p>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India. Courts at the seller&apos;s city have jurisdiction.</p>
      <h2>Contact</h2>
      <p>Email {BIZ.email} or WhatsApp {BIZ.whatsapp} ({BIZ.hours}).</p>
    </PolicyPage>
  );
}
