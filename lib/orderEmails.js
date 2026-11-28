// SERVER ONLY. The emails customers get about their order. Every function is safe to call: it never throws.
import { admin } from '@/lib/supabaseAdmin';
import { sendEmail, emailEnabled } from '@/lib/email';
import { BIZ } from '@/lib/business';
import { SITE, inr } from '@/lib/format';
import { reasonLabel } from '@/lib/returnPolicy';

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
  await emailAdminNewOrder(orderId);   // the shop owner hears about the order too (even if the customer left no email)
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
  await emailAdminOrderEvent(orderId, 'shipped');   // the shop owner gets a copy too
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

export async function emailOrderCancelled(orderId, refundDue, by = 'admin', refundState) {
  await emailAdminOrderEvent(orderId, 'cancelled', { refundDue, by, refundState });   // the shop owner gets a copy too
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


// ======================= emails to the SHOP OWNER (the addresses in ADMIN_EMAILS) =======================
const ownerEmails = () => { const l = (process.env.ADMIN_ALERT_EMAILS || process.env.ADMIN_EMAILS || '').split(',').map((x) => x.trim()).filter(Boolean); return l.length ? l : [BIZ.email]; };
const ownerShell = (title, body) => `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
<div style="background:#111827;color:#fff;padding:14px 20px;font-size:16px;font-weight:700">${esc(BIZ.brand)} admin</div>
<div style="padding:20px;border:1px solid #e5e7eb;border-top:0"><h2 style="margin:0 0 12px;font-size:20px">${esc(title)}</h2>${body}</div></div>`;
async function toOwner(subject, html) { for (const to of ownerEmails()) await sendEmail({ to, subject, html }); }

// A new order that counts (COD, or paid online). The database remembers it was sent, so a second call does nothing.
export async function emailAdminNewOrder(orderId) {
  try {
    if (!emailEnabled()) return;
    const db = admin();
    const { data: claimed } = await db.from('orders').update({ admin_notified_at: new Date().toISOString() }).eq('id', orderId).is('admin_notified_at', null).select('id');
    if (!claimed?.length) return;
    const { data: o } = await db.from('orders').select('*, order_items(*)').eq('id', orderId).maybeSingle();
    if (!o) return;
    const a = o.shipping_address || {}, cod = o.payment_method === 'cod';
    const res = await sendEmail({
      to: ownerEmails()[0], subject: `🛒 New order ${o.order_number} – ${inr(o.total)} (${cod ? 'COD' : 'paid online'})`,
      html: ownerShell(`New order ${o.order_number}`, `<p><b>${inr(o.total)}</b> · ${cod ? 'Cash on delivery' : 'Paid online'}</p>${itemsTable(o)}
<p style="font-size:14px"><b>${esc(a.full_name || o.customer_name)}</b>, ${esc(a.phone || o.customer_phone)}${o.customer_email ? `<br>${esc(o.customer_email)}` : ''}<br>${esc([a.line1, a.line2, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(', '))}</p>${btn(`${SITE}/admin/orders/${o.id}`, 'Open this order')}`),
    });
    for (const extra of ownerEmails().slice(1)) await sendEmail({ to: extra, subject: `🛒 New order ${o.order_number} – ${inr(o.total)}`, html: ownerShell(`New order ${o.order_number}`, `<p><b>${inr(o.total)}</b></p>${btn(`${SITE}/admin/orders/${o.id}`, 'Open this order')}`) });
    if (!res.ok) await db.from('orders').update({ admin_notified_at: null }).eq('id', orderId);
  } catch (e) { console.error('admin new order email', e.message); }
}

export async function emailAdminNewReturn(returnId) {
  try {
    if (!emailEnabled()) return;
    const { data: c } = await admin().from('return_claims').select('id,reason,details,order_id,orders(order_number,customer_name,customer_phone,total)').eq('id', returnId).maybeSingle();
    if (!c) return;
    await toOwner(`↩️ New return request – order ${c.orders?.order_number}`,
      ownerShell(`Return request for order ${c.orders?.order_number}`, `<p><b>${esc(c.orders?.customer_name || '')}</b>, ${esc(c.orders?.customer_phone || '')} · order total ${inr(c.orders?.total || 0)}</p>
<p style="font-size:14px"><b>Reason:</b> ${esc(reasonLabel(c.reason))}<br><b>Details:</b> ${esc(c.details)}</p>${btn(`${SITE}/admin/returns`, 'Review the photos and decide')}`));
  } catch (e) { console.error('admin return email', e.message); }
}

// ======================= emails to the CUSTOMER about a return / refund =======================
// kind: requested | approved | rejected | received | refunded
export async function emailCustomerReturn(returnId, kind) {
  try {
    if (!emailEnabled()) return;
    const { data: c } = await admin().from('return_claims').select('*').eq('id', returnId).maybeSingle();
    if (!c) return;
    const L = await load(c.order_id); if (!L || !L.to) return;
    const { o, to } = L, link = btn(orderLink(o), 'View my order');
    const note = c.admin_note ? `<p style="font-size:14px"><b>Message from us:</b> ${esc(c.admin_note)}</p>` : '';
    let subject, title, body;
    if (kind === 'requested') {
      subject = `We got your return request – order ${o.order_number}`; title = 'We received your return request';
      body = `<p>Thank you. We will check your photos and reply by email and on your order page. This usually takes 1 working day.</p>${link}`;
    } else if (kind === 'approved') {
      subject = `Return accepted – order ${o.order_number}`; title = 'Your return was accepted';
      body = `<p>We accepted the return for order <b>${esc(o.order_number)}</b>.</p>${note}<p style="font-size:14px">We will contact you on WhatsApp for the next step. You can also WhatsApp us on ${esc(BIZ.whatsapp)}.</p>${link}`;
    } else if (kind === 'rejected') {
      subject = `Return not accepted – order ${o.order_number}`; title = 'We could not accept your return';
      body = `<p>We are sorry, we could not accept the return for order <b>${esc(o.order_number)}</b>.</p>${note}<p style="font-size:14px">If you think this is a mistake, WhatsApp us on ${esc(BIZ.whatsapp)} with your order number.</p>${link}`;
    } else if (kind === 'received') {
      subject = `We received your returned item – order ${o.order_number}`; title = 'We received your returned item';
      body = `<p>Thank you. We received the item for order <b>${esc(o.order_number)}</b> and your refund is being processed.</p>${note}${link}`;
    } else {
      const g = Number(c.deduct_gst) || 0, f = Number(c.deduct_fee) || 0, x = Number(c.deduct_other) || 0, cut = g + f + x;
      subject = `Refund of ${inr(c.refund_amount || 0)} sent – order ${o.order_number}`; title = 'Your refund was sent';
      body = `<p>We refunded <b>${inr(c.refund_amount || 0)}</b> for order <b>${esc(o.order_number)}</b>.${o.payment_method === 'online' ? ` It reaches your original payment method within ${esc(BIZ.refundDays)}.` : ''}</p>
${cut > 0 ? `<p style="font-size:14px">${inr(cut)} was deducted (${[g > 0 && `GST ${inr(g)}`, f > 0 && `refund fee ${inr(f)}`, x > 0 && `other charges ${inr(x)}`].filter(Boolean).join(', ')})${c.deduct_note ? `: ${esc(c.deduct_note)}` : ''}.</p>` : ''}${link}`;
    }
    await sendEmail({ to, subject, html: shell(title, body) });
  } catch (e) { console.error('return email', kind, e.message); }
}

// A refund for a cancelled order, sent from "Payment issues".
export async function emailPaymentRefund(issueId) {
  try {
    if (!emailEnabled()) return;
    const { data: p } = await admin().from('payment_issues').select('*').eq('id', issueId).maybeSingle();
    if (!p || !p.order_id || !p.refund_id) return;
    const L = await load(p.order_id); if (!L || !L.to) return;
    const { o, to } = L, amt = p.refunded_paise != null ? p.refunded_paise / 100 : (p.amount_paise || 0) / 100;
    const g = Number(p.deduct_gst) || 0, f = Number(p.deduct_fee) || 0, x = Number(p.deduct_other) || 0, cut = g + f + x;
    await sendEmail({ to, subject: `Refund of ${inr(amt)} sent – order ${o.order_number}`, html: shell('Your refund was sent',
      `<p>We refunded <b>${inr(amt)}</b> for order <b>${esc(o.order_number)}</b>. It reaches your original payment method within ${esc(BIZ.refundDays)}.</p>
${cut > 0 ? `<p style="font-size:14px">${inr(cut)} was deducted (${[g > 0 && `GST ${inr(g)}`, f > 0 && `refund fee ${inr(f)}`, x > 0 && `other charges ${inr(x)}`].filter(Boolean).join(', ')})${p.deduct_note ? `: ${esc(p.deduct_note)}` : ''}.</p>` : ''}${btn(orderLink(o), 'View my order')}`) });
  } catch (e) { console.error('payment refund email', e.message); }
}


// The shop owner is told when an order is shipped or cancelled (by the customer or by the shop).
export async function emailAdminOrderEvent(orderId, kind, extra = {}) {
  try {
    if (!emailEnabled()) return;
    const { data: o } = await admin().from('orders').select('*').eq('id', orderId).maybeSingle();
    if (!o) return;
    const a = o.shipping_address || {}, who = `<p style="font-size:14px"><b>${esc(a.full_name || o.customer_name)}</b>, ${esc(a.phone || o.customer_phone)}${o.customer_email ? `<br>${esc(o.customer_email)}` : ''}</p>`;
    const open = btn(`${SITE}/admin/orders/${o.id}`, 'Open this order');
    if (kind === 'shipped') {
      await toOwner(`📦 Order ${o.order_number} shipped`, ownerShell(`Order ${o.order_number} was shipped`, `<p>${o.courier_name ? `Courier: <b>${esc(o.courier_name)}</b>` : ''}${o.awb_number ? ` · Tracking: <b>${esc(o.awb_number)}</b>` : ''}</p>${who}${open}`));
    } else if (kind === 'cancelled') {
      const byCustomer = extra.by === 'customer';
      await toOwner(`❌ Order ${o.order_number} cancelled ${byCustomer ? 'by the customer' : 'by you'}`, ownerShell(`Order ${o.order_number} was cancelled ${byCustomer ? 'by the customer' : 'by you'}`,
        `<p>${o.cancel_reason ? `Reason: <b>${esc(o.cancel_reason)}</b><br>` : ''}Order total: ${inr(o.total)}${!extra.refundDue ? '' : extra.refundState === 'done' ? `<br><b>Refund of ${inr(o.total)} sent automatically.</b> Nothing to do.`
          : extra.refundState === 'failed' ? `<br><b>Automatic refund FAILED: ${inr(o.total)} is due.</b> Refund it in Admin → Payment issues.`
          : `<br><b>Refund of ${inr(o.total)} is NOT confirmed.</b> Check Razorpay Dashboard and Admin → Payment issues.`}</p>${who}${open}`));
    }
  } catch (e) { console.error('admin order event email', kind, e.message); }
}
