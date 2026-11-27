import PolicyPage from '@/components/PolicyPage';
import { getBiz } from '@/lib/storeInfo';
export const metadata = { title: 'Contact Us' };
export const revalidate = 300;
export default async function Page() {
  const BIZ = await getBiz();
  return (
    <PolicyPage title="Contact Us">
      <p><b>{BIZ.brand}</b> · {BIZ.legalName}<br />{BIZ.address}{BIZ.gstin ? <><br />GSTIN: {BIZ.gstin}</> : null}</p>
      <p>WhatsApp: {BIZ.whatsapp}<br />Email: {BIZ.email}<br />{BIZ.hours}</p>
      <h2>Grievance Officer</h2>
      <p>{BIZ.grievanceOfficer}, {BIZ.email}. We reply within 2 working days.</p>
    </PolicyPage>
  );
}
