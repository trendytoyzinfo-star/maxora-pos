export default function Flash({ sp }) {
  if (sp?.err) return <div className="bad" role="alert">{sp.err}</div>;
  if (sp?.ok) return <div className="ok" role="status">{sp.ok}</div>;
  return null;
}
