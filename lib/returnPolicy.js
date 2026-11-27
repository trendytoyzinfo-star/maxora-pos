import { BIZ } from '@/lib/business';
export const RETURN_REASONS = [
  { value: 'damaged', label: 'Item is damaged or defective' },
  { value: 'wrong_item', label: 'Wrong item received' },
  { value: 'size', label: 'Wrong size received' },
];
export const reasonLabel = (v) => RETURN_REASONS.find((r) => r.value === v)?.label || v;
export const RETURN_MS = BIZ.returnHours * 3600 * 1000;
// Returns: only within 24 hours of delivery. Cancel: only before the order is shipped.
export const returnDeadline = (o) => (o?.delivered_at ? new Date(new Date(o.delivered_at).getTime() + RETURN_MS) : null);
export const canReturn = (o) => o?.status === 'delivered' && !!o.delivered_at && Date.now() <= returnDeadline(o).getTime();
export const canCancel = (o) => ['placed', 'accepted', 'packed'].includes(o?.status) && (o.payment_method === 'cod' || o.payment_status === 'paid');
export const POLICY_LINE = `Cancel any time before your order ships. Returns only within ${BIZ.returnHours} hours of delivery, for damaged, wrong item or wrong size, with a reason and photos.`;

// Why an order is cancelled. The customer and the store each pick from their own list (and may write a few words).
export const CANCEL_REASONS = {
  customer: ['I ordered by mistake', 'I found a better price elsewhere', 'I want to change the toy / quantity', 'I want to change the address', 'Delivery is taking too long', 'I had a payment problem', 'Other'],
  store: ['Out of stock', 'Customer asked us to cancel', 'Wrong or incomplete address', 'Could not reach the customer', 'Suspected fake order', 'Payment problem', 'Price was shown wrongly', 'Other'],
};
// Reads "reason" (a choice) and "reason_other" (free words) from a form. Returns text to save, or null if no reason was chosen.
export function cancelReasonText(formData, who) {
  const list = CANCEL_REASONS[who], pick = String(formData.get('reason') || '').trim(), more = String(formData.get('reason_other') || '').trim().slice(0, 120);
  if (!list.includes(pick)) return null;
  if (pick === 'Other' && more.length < 3) return null;
  const base = (who === 'customer' ? 'Cancelled by customer: ' : 'Cancelled by store: ') + pick;
  return (more && pick !== 'Other' ? `${base} (${more})` : pick === 'Other' ? `${base} - ${more}` : base).slice(0, 190);
}
