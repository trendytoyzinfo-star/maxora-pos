// SERVER ONLY. Builds the shipping label (A6) and the customer bill (A4) as PDF files.
import { Pdf, wrap } from '@/lib/pdf';
import { BIZ } from '@/lib/business';
const money = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });
const day = (d) => new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
const addrLines = (a) => [a.line1, a.line2, a.landmark ? 'Landmark: ' + a.landmark : '', [a.city, a.state].filter(Boolean).join(', ')].filter(Boolean);

export function labelPdf(o) {
  const W = 297.6, H = 419.5, M = 14, p = new Pdf(W, H), a = o.shipping_address || {}, cod = o.payment_method === 'cod' && o.payment_status !== 'paid';
  p.rect(6, 6, W - 12, H - 12, { stroke: true, lw: 1.2 });
  p.text(M, 28, BIZ.brand.toUpperCase(), { size: 16, bold: true }); p.text(W - M, 28, 'SHIPPING LABEL', { size: 9, bold: true, align: 'right' });
  p.line(6, 36, W - 6, 36, 1);
  // payment box
  p.rect(M, 42, W - 2 * M, 26, { fill: cod ? 0.88 : 1, stroke: true, lw: 1.2 });
  p.text(W / 2, 60, cod ? `COD - COLLECT ${money(o.total)}` : 'PREPAID - DO NOT COLLECT CASH', { size: cod ? 14 : 11, bold: true, align: 'center' });
  // order + courier
  p.text(M, 82, 'Order ID', { size: 7, gray: 0.4 }); p.text(M, 96, o.order_number, { size: 14, bold: true });
  p.text(W - M, 82, 'Order date', { size: 7, gray: 0.4, align: 'right' }); p.text(W - M, 96, day(o.created_at), { size: 10, bold: true, align: 'right' });
  if (o.awb_number) p.text(M, 109, `${o.courier_name || 'Courier'}  AWB: ${o.awb_number}`, { size: 9 });
  p.line(6, 115, W - 6, 115);
  // TO
  p.text(M, 127, 'TO', { size: 8, bold: true, gray: 0.4 });
  let y = 140; p.text(M, y, a.full_name || o.customer_name, { size: 13, bold: true }); y += 14;
  for (const l of addrLines(a)) for (const w of wrap(l, 10, W - 2 * M)) { p.text(M, y, w, { size: 10 }); y += 12.5; }
  p.text(M, y + 2, `PIN ${a.pincode || ''}`, { size: 14, bold: true }); y += 20;
  p.text(M, y, `Phone: ${a.phone || o.customer_phone}`, { size: 10, bold: true }); y += 12.5;
  if (o.customer_email) { p.text(M, y, `Email: ${o.customer_email}`, { size: 9 }); y += 12; }
  // FROM
  y += 4; p.line(6, y, W - 6, y); y += 12;
  p.text(M, y, 'FROM', { size: 8, bold: true, gray: 0.4 }); y += 12;
  p.text(M, y, BIZ.brand, { size: 9, bold: true }); y += 11;
  for (const l of BIZ.fromAddress) { p.text(M, y, l, { size: 9 }); y += 11; }
  // items
  y += 2; p.line(6, y, W - 6, y); y += 11;
  p.text(M, y, 'ITEMS', { size: 8, bold: true, gray: 0.4 }); p.text(W - M, y, 'QTY', { size: 8, bold: true, gray: 0.4, align: 'right' }); y += 11;
  const items = o.order_items || [], bottom = H - 16; let shown = 0;
  for (const it of items) {
    const nm = wrap(it.product_name + (it.variant_name ? ` (${it.variant_name})` : ''), 8, W - 2 * M - 30).slice(0, 2), need = nm.length * 9.5 + 9.5;
    if (y + need > bottom - (shown < items.length - 1 ? 10 : 0)) break;
    nm.forEach((l, i) => { p.text(M, y, l, { size: 8, bold: i === 0 }); if (i === 0) p.text(W - M, y, String(it.quantity), { size: 9, bold: true, align: 'right' }); y += 9.5; });
    p.text(M, y, `SKU: ${it.sku || '-'}`, { size: 7.5, gray: 0.3 }); y += 11; shown++;
  }
  if (shown < items.length) p.text(M, y, `+ ${items.length - shown} more item(s) - see order ${o.order_number}`, { size: 8, bold: true });
  return p.build();
}

export function invoicePdf(o, B = BIZ) {
  const W = 595.3, H = 841.9, M = 40, p = new Pdf(W, H), a = o.shipping_address || {};
  const seller = B.legalName.startsWith('YOUR') ? B.brand : B.legalName;
  p.text(M, 52, B.brand, { size: 24, bold: true }); p.text(W - M, 46, B.gstin ? 'TAX INVOICE' : 'INVOICE', { size: 14, bold: true, align: 'right' });
  p.text(W - M, 62, `Invoice no: ${o.order_number}`, { size: 9, align: 'right' }); p.text(W - M, 74, `Date: ${day(o.created_at)}`, { size: 9, align: 'right' });
  let y = 70; p.text(M, y, seller, { size: 9, bold: true }); y += 11;
  for (const l of wrap(B.address, 9, 300)) { p.text(M, y, l, { size: 9 }); y += 11; }
  p.text(M, y, `${B.email}  |  WhatsApp ${B.whatsapp}`, { size: 9 }); y += 11;
  if (B.gstin) { p.text(M, y, `GSTIN: ${B.gstin}`, { size: 9 }); y += 11; }
  y = Math.max(y, 106) + 8; p.line(M, y, W - M, y, 1); y += 16;
  p.text(M, y, 'BILL TO / SHIP TO', { size: 8, bold: true, gray: 0.4 }); p.text(W - M - 190, y, 'PAYMENT', { size: 8, bold: true, gray: 0.4 }); y += 13;
  let ly = y; p.text(M, ly, a.full_name || o.customer_name, { size: 10, bold: true }); ly += 12;
  for (const l of [...addrLines(a), `${a.pincode || ''}`]) for (const w of wrap(l, 9.5, 300)) { p.text(M, ly, w, { size: 9.5 }); ly += 12; }
  p.text(M, ly, `Phone: ${a.phone || o.customer_phone}${o.customer_email ? '   Email: ' + o.customer_email : ''}`, { size: 9.5 }); ly += 12;
  p.text(W - M - 190, y, o.payment_method === 'cod' ? 'Cash on delivery' : 'Paid online (Razorpay)', { size: 10 });
  p.text(W - M - 190, y + 13, `Status: ${o.payment_status}`, { size: 9.5 });
  y = ly + 12;
  const X = { n: M + 4, sku: 300, q: 400, u: 470, t: W - M - 4 };
  const header = () => { p.rect(M, y, W - 2 * M, 20, { fill: 0.92, stroke: false }); const ty = y + 14; p.text(X.n, ty, 'Item', { size: 9, bold: true }); p.text(X.sku, ty, 'SKU', { size: 9, bold: true }); p.text(X.q, ty, 'Qty', { size: 9, bold: true, align: 'right' }); p.text(X.u, ty, 'Price', { size: 9, bold: true, align: 'right' }); p.text(X.t, ty, 'Amount', { size: 9, bold: true, align: 'right' }); y += 30; };
  header();
  for (const it of o.order_items || []) {
    const nm = wrap(it.product_name + (it.variant_name ? ` (${it.variant_name})` : '') + (it.is_free ? ' - FREE toy' : ''), 9.5, X.sku - X.n - 12), sk = wrap(it.sku || '-', 9, 70), rows = Math.max(nm.length, sk.length);
    if (y + rows * 12 > H - 200) { p.addPage(); y = M; header(); }
    nm.forEach((l, i) => p.text(X.n, y + i * 12, l, { size: 9.5 })); sk.forEach((l, i) => p.text(X.sku, y + i * 12, l, { size: 9 }));
    p.text(X.q, y, String(it.quantity), { size: 9.5, align: 'right' }); p.text(X.u, y, money(it.unit_price), { size: 9.5, align: 'right' }); p.text(X.t, y, it.is_free ? `${money(it.line_total)} FREE` : money(it.line_total), { size: 9.5, bold: true, align: 'right' });
    y += rows * 12 + 4; p.line(M, y - 2, W - M, y - 2, 0.3, 0.7); y += 6;
  }
  if (y > H - 200) { p.addPage(); y = M; }
  y += 6; const row = (l, v, b) => { p.text(330, y, l, { size: b ? 11 : 9.5, bold: b }); p.text(X.t, y, v, { size: b ? 11 : 9.5, bold: b, align: 'right' }); y += b ? 18 : 14; };
  row('Subtotal', money(o.subtotal));
  if (Number(o.discount) > 0) row(`Discount${o.offer_label || o.coupon_code ? ' (' + (o.offer_label || o.coupon_code) + ')' : ''}`, '- ' + money(o.discount));
  row('Shipping', Number(o.shipping_total) ? money(o.shipping_total) : 'Free');
  p.line(330, y - 8, W - M, y - 8, 0.8); y += 4; row('Total', money(o.total), true);
  y += 20; p.line(M, y, W - M, y, 0.5, 0.6); y += 14;
  const note = `Returns: only within ${B.returnHours} hours of delivery, for a damaged item, wrong item or wrong size, with a reason and photos sent from your order page. Orders can be cancelled until they ship. Full policy: ${B.brand} Refund & Return Policy on our website.`;
  for (const l of wrap(note, 8.5, W - 2 * M)) { p.text(M, y, l, { size: 8.5, gray: 0.3 }); y += 11; }
  p.text(W / 2, y + 10, 'Thank you for shopping with ' + B.brand + '!', { size: 9, bold: true, align: 'center' });
  return p.build();
}
