import PolicyPage from '@/components/PolicyPage';
import { getBiz } from '@/lib/storeInfo';
export const metadata = { title: 'Privacy Policy' };
export const revalidate = 300;
export default async function Page() {
  const BIZ = await getBiz();
  return (
    <PolicyPage title="Privacy Policy">
      <p>{BIZ.legalName} (&quot;{BIZ.brand}&quot;) respects your privacy. This page explains what we collect and why.</p>
      <h2>What we collect</h2>
      <p>Name, mobile number, email (optional), delivery address and order details, so that we can deliver your order and support you. Payment details are handled only by Razorpay.</p>
      <h2>How we use it</h2>
      <p>To process and deliver orders, send order updates, handle returns and refunds, prevent fraud, and meet legal duties. We do not sell your data.</p>
      <h2>Who we share it with</h2>
      <p>Only service providers needed to fulfil your order: payment gateway (Razorpay), courier partners, and our hosting and database providers (Vercel, Supabase). They may use it only for these purposes.</p>
      <h2>Cookies and storage</h2>
      <p>We store your cart and a pending-order reference in your browser. We do not use advertising cookies.</p>
      <h2>Retention</h2>
      <p>Order records are kept for as long as needed for accounting, tax and legal reasons.</p>
      <h2>Your rights</h2>
      <p>You can ask us to correct or delete your personal data, subject to legal record-keeping needs. Write to {BIZ.email}.</p>
      <h2>Grievance Officer</h2>
      <p>{BIZ.grievanceOfficer}, {BIZ.email}, {BIZ.whatsapp}.</p>
    </PolicyPage>
  );
}
