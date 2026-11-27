'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { admin } from '@/lib/supabaseAdmin';
import { timingSafeStr } from '@/lib/razorpay';
import { isUuid } from '@/lib/validate';
import { uploadImage } from '@/lib/upload';
import { canCancel, canReturn, RETURN_REASONS, cancelReasonText } from '@/lib/returnPolicy';
import { after } from 'next/server';
import { emailOrderCancelled } from '@/lib/orderEmails';

const go = (id, t, msg, ok) => redirect(`/order/${id}?t=${encodeURIComponent(t)}&${ok ? 'ok' : 'err'}=${encodeURIComponent(msg)}#help`);
async function loadOrder(formData) {
  const id = formData.get('id'), t = String(formData.get('t') || '');
  if (!isUuid(id) || !t) redirect('/');
  const { data: o } = await admin().from('orders').select('id,status,payment_method,payment_status,delivered_at,access_token').eq('id', id).maybeSingle();
  if (!o || !timingSafeStr(o.access_token, t)) redirect('/');   // wrong link
  return { o, id, t };
}

// The customer cancels their own order. Only before it is shipped.
export async function cancelMyOrder(formData) {
  const { o, id, t } = await loadOrder(formData);
  if (!canCancel(o)) return go(id, t, 'This order can no longer be cancelled. Once an order is shipped it cannot be cancelled.');
  const why = cancelReasonText(formData, 'customer');
  if (!why) return go(id, t, 'Please choose a reason for cancelling (if you choose Other, write a few words).');
  const { data, error } = await admin().rpc('cancel_order_admin', { p_order_id: id, p_reason: why });
  if (error || !data?.ok) return go(id, t, 'This order can no longer be cancelled. Once an order is shipped it cannot be cancelled.');
  revalidatePath(`/order/${id}`);
  after(() => emailOrderCancelled(id, !!data.refund_due));
  go(id, t, data.refund_due ? 'Order cancelled. Your payment will be refunded within 5-7 working days.' : 'Order cancelled.', true);
}

// The customer asks for a return. Needs a reason and photos, and must be within 24 hours of delivery.
export async function requestReturn(formData) {
  const { o, id, t } = await loadOrder(formData);
  if (!canReturn(o)) return go(id, t, 'Return time out. The 24 hours after delivery are over, so a return can no longer be requested.');
  const reason = String(formData.get('reason') || ''), details = String(formData.get('details') || '').trim().slice(0, 500);
  if (!RETURN_REASONS.some((r) => r.value === reason)) return go(id, t, 'Please choose the reason for the return.');
  if (details.length < 10) return go(id, t, 'Please describe the problem in a few words (at least 10 letters).');
  const files = formData.getAll('photos').filter((x) => x && typeof x !== 'string' && x.size > 0).slice(0, 4);
  if (!files.length) return go(id, t, 'Please add at least 1 clear photo of the problem. Returns without photos cannot be accepted.');
  const db = admin();
  const { data: old } = await db.from('return_claims').select('id').eq('order_id', id).maybeSingle();
  if (old) return go(id, t, 'A return request for this order was already sent.');
  const paths = [];
  for (const f of files) { const r = await uploadImage(f, id, 'return-proofs'); if (r.error) return go(id, t, r.error); if (r.path) paths.push(r.path); }
  const { error } = await db.from('return_claims').insert({ order_id: id, reason, details, photos: paths });
  if (error) return go(id, t, error.code === '23505' ? 'A return request for this order was already sent.' : 'Could not send your request. Please try again.');
  revalidatePath(`/order/${id}`);
  go(id, t, 'Return request sent. We will review your photos and reply on this page.', true);
}
