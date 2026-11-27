import { redirect } from 'next/navigation';
import CheckoutForm from '@/components/CheckoutForm';
import { getCustomer } from '@/lib/customerAuth';
export const metadata = { title: 'Checkout', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
// Only logged-in customers can place an order.
export default async function CheckoutPage() {
  const u = await getCustomer();
  if (!u) redirect('/login?next=/checkout');
  return <CheckoutForm user={{ name: u.name, email: u.email, phone: u.phone }} />;
}
