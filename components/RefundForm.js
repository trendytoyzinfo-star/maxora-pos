'use client';
import { useState } from 'react';
// The small refund form: how much is being refunded, minus GST / refund fee / other charges you decide yourself.
// The server works the amount out again, so these numbers are only a preview.
const n = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
const r = (v) => Math.round(n(v));   // deductions are whole rupees, like on the server
const inr = (v) => '₹' + (Math.round(v * 100) / 100).toLocaleString('en-IN');
export default function RefundForm({ id, base, editBase = false, hidden = {}, primary, secondary = null }) {
  const [b, setB] = useState(String(base || ''));
  const [g, setG] = useState(''), [f, setF] = useState(''), [o, setO] = useState(''), [why, setWhy] = useState('');
  const cut = r(g) + r(f) + r(o), amount = Math.round((n(b) - cut) * 100) / 100;
  const sure = (label) => (e) => {
    if (amount <= 0) { alert('The deductions are more than the refund amount.'); e.preventDefault(); return; }
    if (cut > 0 && why.trim().length < 3) { alert('Write a short reason for the deduction. The customer will see it.'); e.preventDefault(); return; }
    if (!window.confirm(`${label}: customer gets ${inr(amount)}${cut > 0 ? ` (${inr(cut)} deducted)` : ''}. Continue?`)) e.preventDefault();
  };
  return (
    <form className="rf" action={secondary?.action || primary.action}>
      <input type="hidden" name="id" value={id} />
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="rf-grid">
        <label>Refund amount before deductions (₹)<input name="refund_base" type="number" min="1" step="0.01" required value={b} onChange={(e) => setB(e.target.value)} readOnly={!editBase} /></label>
        <label>Less: GST (₹)<input name="deduct_gst" type="number" min="0" step="1" value={g} onChange={(e) => setG(e.target.value)} placeholder="0" /></label>
        <label>Less: refund / gateway fee (₹)<input name="deduct_fee" type="number" min="0" step="1" value={f} onChange={(e) => setF(e.target.value)} placeholder="0" /></label>
        <label>Less: other charges (₹)<input name="deduct_other" type="number" min="0" step="1" value={o} onChange={(e) => setO(e.target.value)} placeholder="0" /></label>
      </div>
      {cut > 0 && <label>Reason for the deduction (the customer sees this)<input name="deduct_note" maxLength={200} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Payment gateway fee and GST are not refundable" /></label>}
      <div className="rf-sum">Customer gets <b>{inr(Math.max(amount, 0))}</b>{cut > 0 && <span className="muted"> ({inr(n(b))} − {inr(cut)})</span>}</div>
      <div className="ret-f">
        {primary && <button className="btn" type="submit" formAction={primary.action} onClick={sure(primary.label)}>{primary.label}</button>}
        {secondary && <button className="btn ghost" type="submit" formAction={secondary.action} onClick={sure(secondary.label)}>{secondary.label}</button>}
      </div>
    </form>
  );
}
