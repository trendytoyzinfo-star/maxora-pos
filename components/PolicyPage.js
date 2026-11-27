import { getBiz } from '@/lib/storeInfo';
export default async function PolicyPage({ title, children }) {
  const biz = await getBiz();
  return (
    <div className="wrap policy">
      <h1>{title}</h1>
      <p className="muted">Last updated: {biz.updated}</p>
      {!biz.configured && <p className="bad">Owner: fill in your legal name, address and grievance officer in Admin → Site before going live.</p>}
      {children}
    </div>
  );
}
