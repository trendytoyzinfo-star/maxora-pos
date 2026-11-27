'use server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin, adminEmails, ADMIN_COOKIE } from '@/lib/adminAuth';
import { isUuid } from '@/lib/validate';
import { uploadImage } from '@/lib/upload';
import { checkShippedOrders } from '@/lib/orderFlow';
import { refundPayment } from '@/lib/razorpay';
import { after } from 'next/server';
import { emailOrderShipped, emailOrderCancelled } from '@/lib/orderEmails';
import { INFO_KEYS } from '@/lib/storeInfo';
import { cancelReasonText } from '@/lib/returnPolicy';
import { sendPasswordReset } from '@/lib/passwordReset';
import { headers } from 'next/headers';
import { SITE } from '@/lib/format';

const back = (path, msg, ok) => redirect(`${path}${path.includes('?') ? '&' : '?'}${ok ? 'ok' : 'err'}=${encodeURIComponent(msg)}`);
const num = (v) => (v === '' || v == null ? NaN : Number(v));
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function login(formData) {
  const email = text(formData.get('email'), 120).toLowerCase(), password = String(formData.get('password') || '');
  if (!email || !password) return back('/admin/login', 'Enter email and password.');
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session || !adminEmails().includes(email)) return back('/admin/login', 'Wrong email or password, or this account is not an admin.');
  (await cookies()).set(ADMIN_COOKIE, data.session.access_token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: Math.min(data.session.expires_in || 3600, 3600) });
  redirect('/admin/orders');
}
export async function logout() { (await cookies()).delete(ADMIN_COOKIE); redirect('/admin/login'); }

// ---------- orders ----------
const FLOW = ['placed', 'accepted', 'packed', 'shipped', 'delivered'];
// One step at a time: placed -> accepted -> packed -> shipped -> delivered. "Shipped" needs the courier and tracking number.
export async function advanceOrder(formData) {
  await requireAdmin();
  const id = formData.get('id'), path = formData.get('return_to') === 'list' ? '/admin/orders' : `/admin/orders/${id}`;
  if (!isUuid(id)) return back('/admin/orders', 'Invalid request.');
  const db = admin();
  const { data: o } = await db.from('orders').select('id,order_number,status,payment_method,payment_status').eq('id', id).maybeSingle();
  if (!o) return back('/admin/orders', 'Order not found.');
  if (o.status === 'cancelled') return back(path, 'This order is cancelled.');
  const next = FLOW[FLOW.indexOf(o.status) + 1];
  if (!next) return back(path, 'This order is already delivered.');
  if (o.payment_method === 'online' && o.payment_status !== 'paid') return back(path, 'Online payment is not confirmed yet. Do not ship.');
  const now = new Date().toISOString(), upd = { status: next, updated_at: now };
  let note = text(formData.get('note'), 200) || null;
  if (next === 'shipped') {
    const cid = formData.get('courier_id'), awb = text(formData.get('awb_number'), 60);
    if (!isUuid(cid)) return back(path, 'Please choose the courier.');
    if (!/^[A-Za-z0-9-]{4,60}$/.test(awb)) return back(path, 'Enter the tracking number (AWB): letters and numbers only, at least 4.');
    const { data: c } = await db.from('couriers').select('name,tracking_url_template').eq('id', cid).maybeSingle();
    if (!c) return back(path, 'Courier not found.');
    upd.courier_name = c.name; upd.awb_number = awb; upd.shipped_at = now;
    upd.tracking_url = c.tracking_url_template ? c.tracking_url_template.replaceAll('{AWB}', encodeURIComponent(awb)) : null;
    note = note || `Shipped via ${c.name}, AWB ${awb}`;
  }
  if (next === 'delivered') { upd.delivered_at = now; if (o.payment_method === 'cod') upd.payment_status = 'paid'; }   // cash collected
  const { data: rows, error } = await db.from('orders').update(upd).eq('id', id).eq('status', o.status).select('id');   // .eq(status) stops a double click
  if (error) { console.error(error); return back(path, 'Could not update: ' + error.message); }
  if (!rows?.length) return back(path, 'This order was just changed. Please refresh and try again.');
  await db.from('order_status_history').insert({ order_id: id, status: next, note });
  revalidatePath(path);
  if (next === 'shipped') after(() => emailOrderShipped(id));
  back(path, `${o.order_number} is now ${next}.`, true);
}
export async function checkTracking() {
  await requireAdmin();
  const r = await checkShippedOrders();
  revalidatePath('/admin/orders');
  back('/admin/orders', r.checked ? `Checked ${r.checked} parcel(s): ${r.delivered} delivered.` : 'Nothing to check automatically. Only Delhivery parcels (with DELHIVERY_API_TOKEN set) are checked. For other couriers press "Mark delivered".', true);
}
export async function cancelOrder(formData) {
  await requireAdmin();
  const id = formData.get('id'), path = formData.get('return_to') === 'list' ? '/admin/orders' : `/admin/orders/${id}`;
  if (!isUuid(id)) return back('/admin/orders', 'Invalid request.');
  const why = cancelReasonText(formData, 'store');
  if (!why) return back(path, 'Please choose the reason for cancelling.');
  const { data, error } = await admin().rpc('cancel_order_admin', { p_order_id: id, p_reason: why });
  if (error || !data?.ok) return back(path, 'Only orders that are not shipped yet can be cancelled.');
  after(() => emailOrderCancelled(id, !!data.refund_due));
  back(path, data.refund_due ? 'Order cancelled and stock restored. REFUND DUE: see Payment issues (you can refund with one button there).' : 'Order cancelled and stock restored.', true);
}

// ---------- products ----------
const slugify = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'toy';
function productFields(f) {
  const name = text(f.get('name'), 200);
  if (name.length < 3) return { error: 'Enter the toy name (at least 3 letters).' };
  const price = num(f.get('price')), mrpRaw = text(f.get('mrp'), 12), mrp = mrpRaw === '' ? null : Number(mrpRaw), ship = num(f.get('shipping_charge'));
  if (!(price >= 1)) return { error: 'Selling price must be at least ₹1.' };
  if (mrp !== null && !(mrp >= price)) return { error: 'MRP cannot be below the selling price. Leave it empty if there is no MRP.' };
  if (!(ship >= 0)) return { error: 'Shipping charge must be 0 or more.' };
  const cat = f.get('category_id');
  if (cat && !isUuid(cat)) return { error: 'Invalid category.' };
  const status = f.get('status');
  if (!['active', 'draft', 'archived'].includes(status)) return { error: 'Invalid status.' };
  const tags = text(f.get('tags'), 300).split(',').map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 10);
  return { upd: { name, price, mrp, shipping_charge: ship, category_id: cat || null, status, short_description: text(f.get('short_description'), 300) || null, description: text(f.get('description'), 5000) || null,
    in_package: text(f.get('in_package'), 1000) || null, sku: text(f.get('sku'), 60) || null, age_group: text(f.get('age_group'), 40) || null, brand: text(f.get('brand'), 60) || 'TrendyToyz', tags,
    seo_title: text(f.get('seo_title'), 70) || null, seo_description: text(f.get('seo_description'), 170) || null, cod_enabled: f.get('cod_enabled') === 'on', is_featured: f.get('is_featured') === 'on' } };
}
// New size / colour options typed in the form (rows nv_name_1..5, nv_price_1..5, nv_stock_1..5). Stock is kept per option.
function newOptions(f, existing) {
  const list = [], names = new Set(existing.map((v) => String(v.name).toLowerCase()));
  for (let i = 1; i <= 5; i++) {
    const name = text(f.get('nv_name_' + i), 60);
    if (!name) continue;
    if (names.has(name.toLowerCase())) return { error: `The option "${name}" already exists for this toy. Use a different name.` };
    const stock = num(f.get('nv_stock_' + i)), price = num(f.get('nv_price_' + i));
    if (!Number.isInteger(stock) || stock < 0) return { error: `Enter the stock (a whole number, 0 or more) for the option "${name}".` };
    if (f.get('nv_price_' + i) !== '' && f.get('nv_price_' + i) != null && !(price >= 1)) return { error: `The price of "${name}" must be at least ₹1, or leave it empty to use the toy's price.` };
    names.add(name.toLowerCase());
    list.push({ id: 'v' + crypto.randomUUID().replace(/-/g, '').slice(0, 10), name, price: price >= 1 ? price : null, stock, is_active: true });
  }
  return { list };
}
// Removes ticked photos, uploads new ones, and keeps the "main photo" first. Returns an error text or null.
async function handleImages(db, id, f) {
  const { data: cur } = await db.from('product_images').select('id,storage_path,sort_order').eq('product_id', id);
  const del = (cur || []).filter((i) => f.get('del_' + i.id) === 'on');
  if (del.length) {
    await db.from('product_images').delete().in('id', del.map((i) => i.id));
    const paths = del.map((i) => i.storage_path);
    const { data: still } = await db.from('product_images').select('storage_path').in('storage_path', paths);
    const keep = new Set((still || []).map((x) => x.storage_path));
    const gone = paths.filter((x) => !keep.has(x));
    if (gone.length) await db.storage.from('product-images').remove(gone);
  }
  const files = f.getAll('images').filter((x) => x && typeof x !== 'string' && x.size > 0).slice(0, 10);
  let order = Math.max(-1, ...(cur || []).filter((i) => !del.includes(i)).map((i) => i.sort_order)) + 1;
  const added = [];
  for (const file of files) {
    const r = await uploadImage(file, 'products');
    if (r.error) return r.error;
    if (r.path) added.push({ product_id: id, storage_path: r.path, sort_order: order++ });
  }
  if (added.length) await db.from('product_images').insert(added);
  const { data: all } = await db.from('product_images').select('id,sort_order').eq('product_id', id).order('sort_order');
  const list = [...(all || [])], main = f.get('main_image');
  if (isUuid(main)) { const i = list.findIndex((x) => x.id === main); if (i > 0) list.unshift(...list.splice(i, 1)); }
  for (let i = 0; i < list.length; i++) if (list[i].sort_order !== i) await db.from('product_images').update({ sort_order: i }).eq('id', list[i].id);
  return null;
}
export async function saveProduct(formData) {
  await requireAdmin();
  const id = formData.get('id'), path = `/admin/products/${id}`;
  if (!isUuid(id)) return back('/admin/products', 'Invalid request.');
  const db = admin();
  const { data: p } = await db.from('products').select('id,variants,stock').eq('id', id).maybeSingle();
  if (!p) return back('/admin/products', 'Product not found.');
  const r = productFields(formData);
  if (r.error) return back(path, r.error);
  const upd = { ...r.upd, updated_at: new Date().toISOString() };
  const variants = Array.isArray(p.variants) ? p.variants : [];
  // existing options (edit price / stock / active, or remove) + new options typed in the form
  const kept = variants.filter((v) => formData.get('vx_' + v.id) !== 'on').map((v) => {
    const s = num(formData.get('vs_' + v.id)), vp = num(formData.get('vp_' + v.id));
    return { ...v, stock: Number.isInteger(s) && s >= 0 ? s : v.stock, price: vp >= 1 ? vp : v.price, is_active: formData.get('va_' + v.id) === 'on' };
  });
  const added = newOptions(formData, kept);
  if (added.error) return back(path, added.error);
  const all = [...kept, ...added.list];
  if (all.length) upd.variants = all;
  else {
    upd.variants = [];
    const stock = num(formData.get('stock'));
    if (formData.get('stock') != null) { if (!Number.isInteger(stock) || stock < 0) return back(path, 'Stock must be a whole number, 0 or more.'); upd.stock = stock; }
    else upd.stock = p.stock ?? 0;
  }
  const { error } = await db.from('products').update(upd).eq('id', id);
  if (error) return back(path, 'Could not save: ' + error.message);
  const imgErr = await handleImages(db, id, formData);
  revalidatePath('/', 'layout');
  if (imgErr) return back(path, 'Saved, but the photos had a problem: ' + imgErr);
  back(path, 'Saved.', true);
}
export async function createProduct(formData) {
  await requireAdmin();
  const P = '/admin/products/new';
  const r = productFields(formData);
  if (r.error) return back(P, r.error);
  const stock = num(formData.get('stock'));
  if (!Number.isInteger(stock) || stock < 0) return back(P, 'Stock must be a whole number, 0 or more.');
  const opts = newOptions(formData, []);
  if (opts.error) return back(P, opts.error);
  const db = admin();
  let row = null, error = null;
  for (let n = 0; n < 3 && !row; n++) {
    ({ data: row, error } = await db.from('products').insert({ ...r.upd, stock, ...(opts.list.length ? { variants: opts.list } : {}), slug: `${slugify(r.upd.name)}-${crypto.randomUUID().slice(0, 4)}` }).select('id').single());
    if (error && error.code !== '23505') break;
  }
  if (!row) return back(P, 'Could not save: ' + (error?.message || 'try again'));
  const imgErr = await handleImages(db, row.id, formData);
  revalidatePath('/', 'layout');
  back(`/admin/products/${row.id}`, imgErr ? 'Toy added, but the photos had a problem: ' + imgErr : 'Toy added.', !imgErr);
}

// ---------- categories ----------
export async function saveCategory(formData) {
  await requireAdmin();
  const id = formData.get('id') || '', P = '/admin/categories';
  const name = text(formData.get('name'), 60), order = num(formData.get('sort_order'));
  if (name.length < 2) return back(P, 'Enter the category name.');
  if (id && !isUuid(id)) return back(P, 'Invalid request.');
  const upd = { name, sort_order: Number.isInteger(order) ? order : 0, is_active: formData.get('is_active') === 'on' };
  const img = await uploadImage(formData.get('image'), 'categories');
  if (img.error) return back(P, img.error);
  if (img.path) upd.image_path = img.path;
  const db = admin();
  const res = id ? await db.from('categories').update(upd).eq('id', id) : await db.from('categories').insert({ ...upd, slug: slugify(name) });
  if (res.error) return back(P, res.error.code === '23505' ? 'A category with this name already exists.' : 'Could not save: ' + res.error.message);
  revalidatePath('/', 'layout'); back(P, id ? 'Category saved.' : 'Category added.', true);
}
export async function deleteCategory(formData) {
  await requireAdmin();
  const id = formData.get('id');
  if (!isUuid(id)) return back('/admin/categories', 'Invalid request.');
  const { error } = await admin().from('categories').delete().eq('id', id);   // toys in it become "Non-categorised"
  if (error) return back('/admin/categories', 'Could not delete: ' + error.message);
  revalidatePath('/', 'layout'); back('/admin/categories', 'Category deleted. Its toys are now Non-categorised.', true);
}

// ---------- settings, coupons, payment issues ----------
export async function saveSettings(formData) {
  await requireAdmin();
  const free = text(formData.get('free_shipping_above'), 10), v = free === '' ? null : Number(free);
  if (v !== null && !(v >= 0)) return back('/admin/settings', 'Free shipping amount must be a number.');
  const { error } = await admin().from('store_settings').update({ cod_enabled: formData.get('cod_enabled') === 'on', free_shipping_above: v }).eq('id', 1);
  if (error) return back('/admin/settings', 'Could not save: ' + error.message);
  back('/admin/settings', 'Saved.', true);
}
export async function toggleCoupon(formData) {
  await requireAdmin();
  const id = formData.get('id'), on = formData.get('on') === '1';
  if (!isUuid(id)) return back('/admin/coupons', 'Invalid request.');
  const { error } = await admin().from('coupons').update({ is_active: on }).eq('id', id);
  if (error) return back('/admin/coupons', 'Could not save: ' + error.message);
  revalidatePath('/admin/coupons');
  back('/admin/coupons', on ? 'Coupon turned on.' : 'Coupon turned off.', true);
}
export async function resolveIssue(formData) {
  await requireAdmin();
  const id = formData.get('id');
  if (!isUuid(id)) return back('/admin/payments', 'Invalid request.');
  await admin().from('payment_issues').update({ resolved: true }).eq('id', id);
  revalidatePath('/admin/payments');
  back('/admin/payments', 'Marked as refunded / resolved.', true);
}

// ---------- offers (coupons) ----------
export async function createCoupon(formData) {
  await requireAdmin();
  const P = '/admin/coupons';
  const code = text(formData.get('code'), 30).toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return back(P, 'Code must be 3 to 30 letters or numbers, no spaces.');
  const type = formData.get('discount_type');
  if (type !== 'percent' && type !== 'flat') return back(P, 'Choose percent or flat discount.');
  const value = num(formData.get('discount_value'));
  if (!(value > 0) || (type === 'percent' && value > 90)) return back(P, type === 'percent' ? 'Percent must be between 1 and 90.' : 'Enter the discount amount.');
  const min = num(formData.get('min_order')), max = num(formData.get('max_discount')), lim = num(formData.get('usage_limit'));
  const day = text(formData.get('expires_on'), 10);
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return back(P, 'Invalid expiry date.');
  const { error } = await admin().from('coupons').insert({
    code, description: text(formData.get('description'), 120) || null, discount_type: type, discount_value: value,
    min_order: min >= 0 ? min : 0, max_discount: max > 0 ? max : null, usage_limit: Number.isInteger(lim) && lim > 0 ? lim : null,
    expires_at: day ? new Date(`${day}T23:59:59+05:30`).toISOString() : null, is_active: true, first_order_only: formData.get('first_order_only') === 'on' });
  if (error) return back(P, error.code === '23505' ? 'This code already exists.' : 'Could not save: ' + error.message);
  revalidatePath(P); back(P, `Offer ${code} created.`, true);
}
export async function deleteCoupon(formData) {
  await requireAdmin();
  const id = formData.get('id');
  if (!isUuid(id)) return back('/admin/coupons', 'Invalid request.');
  const { data: c } = await admin().from('coupons').select('used_count').eq('id', id).maybeSingle();
  if (!c) return back('/admin/coupons', 'Offer not found.');
  if (c.used_count > 0) return back('/admin/coupons', 'This offer was already used, so it is kept for your records. Turn it off instead.');
  await admin().from('coupons').delete().eq('id', id);
  revalidatePath('/admin/coupons'); back('/admin/coupons', 'Offer deleted.', true);
}

// ---------- couriers ----------
export async function addCourier(formData) {
  await requireAdmin();
  const name = text(formData.get('name'), 60), url = text(formData.get('tracking_url_template'), 300);
  if (name.length < 2) return back('/admin/couriers', 'Enter the courier name.');
  if (url && (!/^https:\/\//i.test(url) || !url.includes('{AWB}'))) return back('/admin/couriers', 'Tracking link must start with https:// and contain {AWB}, or leave it empty.');
  const { error } = await admin().from('couriers').insert({ name, tracking_url_template: url || null, sort_order: 50 });
  if (error) return back('/admin/couriers', error.code === '23505' ? 'This courier already exists.' : 'Could not save: ' + error.message);
  revalidatePath('/admin/couriers'); back('/admin/couriers', 'Courier added.', true);
}
export async function toggleCourier(formData) {
  await requireAdmin();
  const id = formData.get('id');
  if (!isUuid(id)) return back('/admin/couriers', 'Invalid request.');
  await admin().from('couriers').update({ is_active: formData.get('on') === '1' }).eq('id', id);
  revalidatePath('/admin/couriers'); back('/admin/couriers', 'Saved.', true);
}

// ---------- returns (customers send the request from their order page; you accept or reject) ----------
export async function decideReturn(formData) {
  await requireAdmin();
  const id = formData.get('id'), accept = formData.get('decision') === 'accept', note = text(formData.get('admin_note'), 300);
  if (!isUuid(id)) return back('/admin/returns', 'Invalid request.');
  if (!accept && note.length < 3) return back('/admin/returns', 'Write a short reason for rejecting, the customer will see it.');
  const now = new Date().toISOString();
  const { data: rows, error } = await admin().from('return_claims').update({ status: accept ? 'approved' : 'rejected', admin_note: note || null, decided_at: now, updated_at: now }).eq('id', id).eq('status', 'requested').select('id');
  if (error) return back('/admin/returns', 'Could not save: ' + error.message);
  if (!rows?.length) return back('/admin/returns', 'This request was already decided. Please refresh.');
  revalidatePath('/admin/returns'); back('/admin/returns', accept ? 'Return accepted.' : 'Return rejected.', true);
}
// Two separate actions for the two buttons (the button's own value was not always sent, so Accept could be read as Reject).
export async function acceptReturn(formData) { formData.set('decision', 'accept'); return decideReturn(formData); }
export async function rejectReturn(formData) { formData.set('decision', 'reject'); return decideReturn(formData); }
// The admin opened these orders / returns: they are not "new" any more.
export async function markSeen(kind, ids) {
  await requireAdmin();
  const list = (Array.isArray(ids) ? ids : []).filter(isUuid).slice(0, 200);
  if (!list.length || !['orders', 'returns'].includes(kind)) return { ok: false };
  const { error } = await admin().from(kind === 'orders' ? 'orders' : 'return_claims').update({ seen_at: new Date().toISOString() }).in('id', list).is('seen_at', null);
  return { ok: !error };
}
export async function advanceReturn(formData) {
  await requireAdmin();
  const id = formData.get('id'), to = formData.get('to');
  if (!isUuid(id) || !['received', 'refunded'].includes(to)) return back('/admin/returns', 'Invalid request.');
  const upd = { status: to, updated_at: new Date().toISOString() }, note = text(formData.get('admin_note'), 300);
  if (note) upd.admin_note = note;
  if (to === 'refunded') { const amt = num(formData.get('refund_amount')); if (!(amt > 0)) return back('/admin/returns', 'Enter the refund amount you paid back.'); upd.refund_amount = amt; }
  const { data: rows, error } = await admin().from('return_claims').update(upd).eq('id', id).eq('status', to === 'received' ? 'approved' : 'received').select('id');
  if (error) return back('/admin/returns', 'Could not save: ' + error.message);
  if (!rows?.length) return back('/admin/returns', 'This return is not at the right step. Please refresh.');
  revalidatePath('/admin/returns'); back('/admin/returns', to === 'received' ? 'Marked as received.' : 'Marked as refunded.', true);
}

// ---------- banners ----------
const okLink = (u) => u === '' || /^\/[^/\\]/.test(u) || u === '/' || /^https:\/\/[^\s]+$/i.test(u);
export async function saveBanner(formData) {
  await requireAdmin();
  const id = formData.get('id') || '', P = '/admin/banners';
  if (id && !isUuid(id)) return back(P, 'Invalid request.');
  const link = text(formData.get('link_url'), 300), order = num(formData.get('sort_order'));
  if (!okLink(link)) return back(P, 'Link must start with / (a page of your store, like /products) or https://');
  const upd = { title: text(formData.get('title'), 80) || null, subtitle: text(formData.get('subtitle'), 140) || null, button_text: text(formData.get('button_text'), 30) || null, link_url: link || null, sort_order: Number.isInteger(order) ? order : 0, is_active: formData.get('is_active') === 'on' };
  const img = await uploadImage(formData.get('image'), 'banners');
  if (img.error) return back(P, img.error);
  if (img.path) upd.image_path = img.path; else if (!id) return back(P, 'Please choose the banner picture.');
  const db = admin(), res = id ? await db.from('banners').update(upd).eq('id', id) : await db.from('banners').insert(upd);
  if (res.error) return back(P, 'Could not save: ' + res.error.message);
  revalidatePath('/', 'layout'); back(P, id ? 'Banner saved.' : 'Banner added.', true);
}
export async function deleteBanner(formData) {
  await requireAdmin();
  const id = formData.get('id');
  if (!isUuid(id)) return back('/admin/banners', 'Invalid request.');
  await admin().from('banners').delete().eq('id', id);
  revalidatePath('/', 'layout'); back('/admin/banners', 'Banner deleted.', true);
}
export async function toggleBanner(formData) {
  await requireAdmin();
  const id = formData.get('id');
  if (!isUuid(id)) return back('/admin/banners', 'Invalid request.');
  await admin().from('banners').update({ is_active: formData.get('on') === '1' }).eq('id', id);
  revalidatePath('/', 'layout'); back('/admin/banners', 'Saved.', true);
}

// ---------- inventory ----------
export async function setStock(formData) {
  await requireAdmin();
  const tab = formData.get('tab') === 'low' ? 'low' : 'all', q = text(formData.get('q'), 40), cat = text(formData.get('cat'), 40);
  const P = `/admin/inventory?tab=${tab}${q ? '&q=' + encodeURIComponent(q) : ''}${cat ? '&cat=' + encodeURIComponent(cat) : ''}`;
  const id = formData.get('id');
  if (!isUuid(id)) return back(P, 'Invalid request.');
  const db = admin();
  const { data: p } = await db.from('products').select('id,name,variants').eq('id', id).maybeSingle();
  if (!p) return back(P, 'Product not found.');
  const upd = { updated_at: new Date().toISOString() }, vs = Array.isArray(p.variants) ? p.variants : [];
  if (vs.length) upd.variants = vs.map((v) => { const s = num(formData.get('vs_' + v.id)); return Number.isInteger(s) && s >= 0 ? { ...v, stock: s } : v; });
  else { const s = num(formData.get('stock')); if (!Number.isInteger(s) || s < 0) return back(P, 'Stock must be a whole number, 0 or more.'); upd.stock = s; }
  const { error } = await db.from('products').update(upd).eq('id', id);
  if (error) return back(P, 'Could not save: ' + error.message);
  revalidatePath('/', 'layout'); back(P, `${p.name}: stock saved.`, true);
}
export async function saveLowStock(formData) {
  await requireAdmin();
  const n = num(formData.get('threshold'));
  if (!Number.isInteger(n) || n < 0 || n > 1000) return back('/admin/inventory?tab=low', 'Enter a whole number from 0 to 1000.');
  const { error } = await admin().from('store_settings').update({ low_stock_threshold: n }).eq('id', 1);
  if (error) return back('/admin/inventory?tab=low', 'Could not save. Run the 05 SQL file in Supabase first.');
  revalidatePath('/admin', 'layout'); back('/admin/inventory?tab=low', `Low stock alert is now ${n}.`, true);
}


// ---------- buy X get Y free deals (automatic, new ones start OFF) ----------
const istTime = (v) => { const t = text(v, 16); return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t) ? new Date(`${t}:00+05:30`).toISOString() : null; };
const scopeIds = (f) => {
  const scope = f.get('scope');
  if (!['all', 'category', 'product'].includes(scope)) return { error: 'Choose where this applies.' };
  const category_id = f.get('category_id'), product_id = f.get('product_id');
  if (scope === 'category' && !isUuid(category_id)) return { error: 'Choose the category.' };
  if (scope === 'product' && !isUuid(product_id)) return { error: 'Choose the toy.' };
  return { scope, category_id: scope === 'category' ? category_id : null, product_id: scope === 'product' ? product_id : null };
};
export async function createDeal(formData) {
  await requireAdmin();
  const P = '/admin/coupons#deals', buy = num(formData.get('buy_qty')), free = num(formData.get('free_qty'));
  if (!Number.isInteger(buy) || buy < 1 || buy > 20 || !Number.isInteger(free) || free < 1 || free > 20) return back(P, 'Buy and free quantities must be whole numbers from 1 to 20.');
  const sc = scopeIds(formData); if (sc.error) return back(P, sc.error);
  const pct = num(formData.get('free_limit_pct'));
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) return back(P, 'The free toy price limit must be a whole number from 1 to 100.');
  const starts = istTime(formData.get('starts_at')), ends = istTime(formData.get('ends_at'));
  if (starts && ends && new Date(ends) <= new Date(starts)) return back(P, 'The end time must be after the start time.');
  const name = text(formData.get('name'), 60) || `Buy ${buy} Get ${free} Free`;
  const { error } = await admin().from('deals').insert({ name, buy_qty: buy, free_qty: free, free_limit_pct: pct, ...sc, starts_at: starts, ends_at: ends, is_active: false });
  if (error) return back(P, 'Could not save: ' + error.message);
  revalidatePath('/admin/coupons'); back(P, `"${name}" created. It is OFF. Turn it on when you want it live.`, true);
}
export async function toggleDeal(formData) {
  await requireAdmin();
  const id = formData.get('id'), on = formData.get('on') === '1';
  if (!isUuid(id)) return back('/admin/coupons', 'Invalid request.');
  await admin().from('deals').update({ is_active: on }).eq('id', id);
  revalidatePath('/admin/coupons'); back('/admin/coupons#deals', on ? 'Deal is now LIVE.' : 'Deal turned off.', true);
}
export async function deleteDeal(formData) {
  await requireAdmin();
  const id = formData.get('id');
  if (!isUuid(id)) return back('/admin/coupons', 'Invalid request.');
  await admin().from('deals').delete().eq('id', id);
  revalidatePath('/admin/coupons'); back('/admin/coupons#deals', 'Deal deleted.', true);
}

// ---------- timed price changes (new ones start OFF) ----------
export async function createPriceRule(formData) {
  await requireAdmin();
  const P = '/admin/coupons#prices';
  const direction = formData.get('direction'), mode = formData.get('mode'), value = num(formData.get('value'));
  if (!['increase', 'decrease'].includes(direction) || !['percent', 'amount'].includes(mode)) return back(P, 'Choose increase or decrease, and % or ₹.');
  if (!(value > 0)) return back(P, 'Enter how much.');
  if (mode === 'percent' && direction === 'decrease' && value > 90) return back(P, 'A price cannot be reduced by more than 90%.');
  if (mode === 'percent' && direction === 'increase' && value > 300) return back(P, 'A price cannot be increased by more than 300%.');
  const sc = scopeIds(formData); if (sc.error) return back(P, sc.error);
  const starts = istTime(formData.get('starts_at')), ends = istTime(formData.get('ends_at'));
  if (!starts || !ends) return back(P, 'Choose the start and end date and time.');
  if (new Date(ends) <= new Date(starts)) return back(P, 'The end time must be after the start time.');
  if (new Date(ends) <= new Date()) return back(P, 'The end time is already over.');
  const label = (mode === 'percent' ? `${value}%` : `₹${value}`) + (direction === 'increase' ? ' higher' : ' lower');
  const name = text(formData.get('name'), 60) || `Price ${label}`;
  const { error } = await admin().from('price_rules').insert({ name, ...sc, direction, mode, value, starts_at: starts, ends_at: ends, is_active: false, allow_other_offers: formData.get('allow_other_offers') === 'on' });
  if (error) return back(P, 'Could not save: ' + error.message);
  revalidatePath('/admin/coupons'); back(P, `"${name}" created. It is OFF. Turn it on and it runs between your start and end time.`, true);
}
export async function togglePriceRule(formData) {
  await requireAdmin();
  const id = formData.get('id'), on = formData.get('on') === '1';
  if (!isUuid(id)) return back('/admin/coupons', 'Invalid request.');
  await admin().from('price_rules').update({ is_active: on }).eq('id', id);
  revalidatePath('/', 'layout'); back('/admin/coupons#prices', on ? 'Price change switched ON. It runs between its start and end time.' : 'Price change turned off. Prices are back to normal.', true);
}
export async function deletePriceRule(formData) {
  await requireAdmin();
  const id = formData.get('id');
  if (!isUuid(id)) return back('/admin/coupons', 'Invalid request.');
  await admin().from('price_rules').delete().eq('id', id);
  revalidatePath('/', 'layout'); back('/admin/coupons#prices', 'Price change deleted.', true);
}

// ---------- site: announcement bar, favicon, store info ----------
export async function saveSite(formData) {
  await requireAdmin();
  const P = '/admin/site';
  const aText = text(formData.get('announcement_text'), 140), aLink = text(formData.get('announcement_link'), 300);
  if (!okLink(aLink)) return back(P, 'The bar link must start with / (a page of your store, like /products) or https://');
  const info = {};
  for (const k of INFO_KEYS) { const v = text(formData.get('info_' + k), k === 'address' ? 220 : 100); if (v) info[k] = v; }
  if (info.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(info.email)) return back(P, 'Please enter a valid email address.');
  const upd = { announcement_text: aText || null, announcement_link: aLink || null, announcement_active: formData.get('announcement_active') === 'on' && !!aText, store_info: info };
  const fav = await uploadImage(formData.get('favicon'), 'branding');
  if (fav.error) return back(P, fav.error);
  if (fav.path) upd.favicon_path = fav.path; else if (formData.get('remove_favicon') === 'on') upd.favicon_path = null;
  const { error } = await admin().from('store_settings').update(upd).eq('id', 1);
  if (error) return back(P, 'Could not save. Run the 06 SQL file in Supabase first. (' + error.message + ')');
  revalidatePath('/', 'layout'); back(P, 'Saved.', true);
}

// ---------- refunds through Razorpay (one click; the database makes sure a refund is never sent twice) ----------
const rzpFail = async (e, undo) => { if (e?.status) { await undo(); return 'Razorpay said: ' + e.message; } return 'Could not confirm the refund (network problem). Open Razorpay Dashboard → Payments and check before you try again.'; };
export async function refundIssue(formData) {
  await requireAdmin();
  const id = formData.get('id'), P = '/admin/payments';
  if (!isUuid(id)) return back(P, 'Invalid request.');
  const db = admin();
  const { data: got } = await db.from('payment_issues').update({ refund_state: 'processing' }).eq('id', id).eq('resolved', false).is('refund_state', null).select('razorpay_payment_id,amount_paise');
  if (!got?.length) return back(P, 'This one is already being refunded, or is done.');
  const r = got[0];
  if (!(r.amount_paise > 0)) { await db.from('payment_issues').update({ refund_state: null }).eq('id', id); return back(P, 'The amount is missing. Refund it in Razorpay Dashboard, then press Mark refunded.'); }
  let failed = null;
  try {
    const out = await refundPayment(r.razorpay_payment_id, r.amount_paise, { reason: 'TrendyToyz refund' });
    await db.from('payment_issues').update({ resolved: true, refund_state: 'done', refund_id: out.id }).eq('id', id);
  } catch (e) { failed = await rzpFail(e, () => db.from('payment_issues').update({ refund_state: null }).eq('id', id)); }
  revalidatePath(P);
  if (failed) return back(P, failed);
  back(P, 'Refund sent to the customer through Razorpay.', true);
}
export async function refundReturn(formData) {
  await requireAdmin();
  const id = formData.get('id'), P = '/admin/returns', amt = num(formData.get('refund_amount'));
  if (!isUuid(id)) return back(P, 'Invalid request.');
  if (!(amt > 0)) return back(P, 'Enter the refund amount.');
  const db = admin();
  const { data: c } = await db.from('return_claims').select('id,status,refund_state,orders(total,payment_method,payment_status,razorpay_payment_id)').eq('id', id).maybeSingle();
  const o = c?.orders;
  if (!c || c.status !== 'received') return back(P, 'Mark the item as received first.');
  if (!o || o.payment_method !== 'online' || o.payment_status !== 'paid' || !o.razorpay_payment_id) return back(P, 'This order was not paid online. Refund it yourself (UPI/bank) and press Mark refunded.');
  if (amt > Number(o.total)) return back(P, 'The refund cannot be more than the order total.');
  const { data: got } = await db.from('return_claims').update({ refund_state: 'processing' }).eq('id', id).eq('status', 'received').is('refund_state', null).select('id');
  if (!got?.length) return back(P, 'This refund is already being sent, or is done.');
  let failed = null;
  try {
    const out = await refundPayment(o.razorpay_payment_id, Math.round(amt * 100), { reason: 'TrendyToyz return refund' });
    await db.from('return_claims').update({ status: 'refunded', refund_amount: amt, refund_state: 'done', refund_id: out.id, updated_at: new Date().toISOString() }).eq('id', id);
  } catch (e) { failed = await rzpFail(e, () => db.from('return_claims').update({ refund_state: null }).eq('id', id)); }
  revalidatePath(P);
  if (failed) return back(P, failed);
  back(P, 'Refund sent through Razorpay and marked refunded.', true);
}


// ---------- customer account help (customer forgot the password AND cannot open that email) ----------
const siteOrigin = async () => { const h = await headers(), host = h.get('x-forwarded-host') || h.get('host'); return host ? `https://${host}` : SITE; };
export async function changeAccountEmail(formData) {
  await requireAdmin();
  const id = formData.get('id'), email = text(formData.get('email'), 120).toLowerCase(), P = '/admin/accounts';
  if (!isUuid(id)) return back(P, 'Invalid request.');
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) return back(P, 'Enter a valid new email address.');
  const { error } = await admin().auth.admin.updateUserById(id, { email, email_confirm: true });
  if (error) return back(P, /already|registered|exists/i.test(error.message) ? 'Another account already uses this email.' : 'Could not change the email: ' + error.message);
  const sent = await sendPasswordReset(email, await siteOrigin());
  back(P + `?q=${encodeURIComponent(email)}`, sent ? `Login email changed to ${email} and a password reset link was sent there.` : `Login email changed to ${email}, but the reset email could not be sent. Ask the customer to use “Forgot your password?” on the login page.`, sent);
}
export async function sendAccountReset(formData) {
  await requireAdmin();
  const email = text(formData.get('email'), 120).toLowerCase(), P = '/admin/accounts';
  if (!email) return back(P, 'Invalid request.');
  const sent = await sendPasswordReset(email, await siteOrigin());
  back(P + `?q=${encodeURIComponent(email)}`, sent ? `Reset link sent to ${email}.` : 'Could not send the email. Check the email settings (Resend) in Vercel.', sent);
}
