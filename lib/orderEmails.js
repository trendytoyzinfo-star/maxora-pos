// SERVER ONLY. The emails customers get about their order. Every function is safe to call: it never throws.
import { admin } from '@/lib/supabaseAdmin';
import { sendEmail, emailEnabled } from '@/lib/email';
import { BIZ } from '@/lib/business';
import { SITE, inr } from '@/lib/format';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function shell(title, body) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
<div style="background:#4F46E5;color:#fff;padding:16px 20px;font-size:20px;font-weight:700">${esc(BIZ.brand)}</div>
<div style="padding:20px;border:1px solid #e5e7eb;border-top:0">
<h2 style="margin:0 0 12px;font-size:20px">${esc(title)}</h2>${body}
<p style="color:#6b7280;font-size:13px;margin-top:24px">Need help? WhatsApp ${esc(BIZ.whatsapp)} or write to ${esc(BIZ.email)}.</p>
</div></div>`;
}
const btn = (href, text) => `<p><a href="${esc(href)}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700">${esc(text)}</a></p>`;

async function load(orderId) {
  const db = admin();
  const { data: o } = await db.from('orders').select('*, order_items(*)').eq('id', orderId).maybeSingle();
  if (!o) return null;
  let to = o.customer_email || null;
  if (!to && o.user_id) { const { data } = await db.auth.admin.getUserById(o.user_id); to = data?.user?.email || null; }
  return { db, o, to };
}
const orderLink = (o) => `${SITE}/order/${o.id}?t=${o.access_token}`;

function itemsTable(o) {
  const rows = (o.order_items || []).map((i) => `<tr><td style="padding:6px 0">${esc(i.product_name)}${i.variant_name ? ` (${esc(i.variant_name)})` : ''} × ${i.quantity}${i.is_free ? ' 🎁 FREE' : ''}</td><td style="padding:6px 0;text-align:right">${i.is_free ? `<s>${inr(i.line_total)}</s> FREE` : inr(i.line_total)}</td></tr>`).join('');
  const r = (l, v, b) => `<tr><td style="padding:3px 0;${b ? 'font-weight:700' : ''}">${l}</td><td style="padding:3px 0;text-align:right;${b ? 'font-weight:700' : ''}">${v}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}<tr><td colspan="2"><hr style="border:0;border-top:1px solid #e5e7eb"></td></tr>
${r('Subtotal', inr(o.subtotal))}${Number(o.discount) > 0 ? r(`Discount${o.offer_label ? ` (${esc(o.offer_label)})` : ''}`, '− ' + inr(o.discount)) : ''}${r('Shipping', Number(o.shipping_total) ? inr(o.shipping_total) : 'Free')}${r('Total', inr(o.total), true)}</table>`;
}

// Sent once per order (the database remembers it, so a second call does nothing).
export async function emailOrderConfirmation(orderId) {
  try {
    if (!emailEnabled()) return;
    const L = await load(orderId); if (!L || !L.to) return;
    const { db, o, to } = L;
    const { data: claimed } = await db.from('orders').update({ confirmation_emailed_at: new Date().toISOString() }).eq('id', orderId).is('confirmation_emailed_at', null).select('id');
    if (!claimed?.length) return;
    const a = o.shipping_address || {};
    const cod = o.payment_method === 'cod';
    const res = await sendEmail({
      to, subject: `Order ${o.order_number} confirmed – ${BIZ.brand}`,
      html: shell(`Thank you${o.customer_name ? ', ' + o.customer_name.split(' ')[0] : ''}! Your order is ${cod ? 'placed' : 'confirmed'}`,
        `<p>Order <b>${esc(o.order_number)}</b>. ${cod ? `Please keep ${inr(o.total)} ready at delivery.` : 'We received your payment.'}</p>${itemsTable(o)}
<p style="font-size:14px"><b>Delivering to:</b><br>${esc(a.full_name || o.customer_name)}, ${esc(a.phone || o.customer_phone)}<br>${esc([a.line1, a.line2, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(', '))}</p>
<p style="font-size:14px">Dispatch usually takes ${esc(BIZ.dispatchDays)}. You can cancel any time before it ships, from your order page.</p>${btn(orderLink(o), 'View my order')}`),
    });
    if (!res.ok) await db.from('orders').update({ confirmation_emailed_at: null }).eq('id', orderId);
  } catch (e) { console.error('confirmation email', e.message); }
}

export async function emailOrderShipped(orderId) {
  try {
    if (!emailEnabled()) return;
    const L = await load(orderId); if (!L || !L.to) return;
    const { o, to } = L;
    await sendEmail({
      to, subject: `Order ${o.order_number} has shipped – ${BIZ.brand}`,
      html: shell('Your order is on its way', `<p>Order <b>${esc(o.order_number)}</b> was shipped${o.courier_name ? ` via <b>${esc(o.courier_name)}</b>` : ''}.</p>
${o.awb_number ? `<p>Tracking number: <b>${esc(o.awb_number)}</b></p>` : ''}${o.tracking_url ? btn(o.tracking_url, 'Track package') : ''}${btn(orderLink(o), 'View my order')}
<p style="font-size:14px">Returns are accepted only within ${BIZ.returnHours} hours of delivery, for a damaged or wrong item, with photos.</p>`),
    });
  } catch (e) { console.error('shipped email', e.message); }
}

export async function emailOrderCancelled(orderId, refundDue) {
  try {
    if (!emailEnabled()) return;
    const L = await load(orderId); if (!L || !L.to) return;
    const { o, to } = L;
    await sendEmail({
      to, subject: `Order ${o.order_number} cancelled – ${BIZ.brand}`,
      html: shell('Your order was cancelled', `<p>Order <b>${esc(o.order_number)}</b> was cancelled${o.cancel_reason ? `: ${esc(o.cancel_reason)}` : ''}.</p>
${refundDue ? `<p>Your payment of ${inr(o.total)} will be refunded to your original payment method within ${esc(BIZ.refundDays)}.</p>` : ''}${btn(orderLink(o), 'View my order')}`),
    });
  } catch (e) { console.error('cancel email', e.message); }
}

export async function emailPasswordReset(to, link) {
  return sendEmail({
    to, subject: `Reset your ${BIZ.brand} password`,
    html: shell('Reset your password', `<p>Tap the button to choose a new password. This link works for 1 hour. If you did not ask for it, ignore this email.</p>${btn(link, 'Choose a new password')}`),
  });
}
