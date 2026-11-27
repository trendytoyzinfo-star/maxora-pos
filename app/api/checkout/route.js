import { admin } from '@/lib/supabaseAdmin';
import { cleanItems, cleanCustomer } from '@/lib/validate';
import { quote } from '@/lib/pricing';
import { createRzpOrder, razorpayKeyId } from '@/lib/razorpay';
import { getCustomer } from '@/lib/customerAuth';
import { after } from 'next/server';
import { emailOrderConfirmation } from '@/lib/orderEmails';

export const dynamic = 'force-dynamic';
const fail = (error, status = 400, extra = {}) => Response.json({ error, ...extra }, { status });

export async function POST(req) {
  const b = await req.json().catch(() => null);
  if (!b) return fail('Invalid request.');
  const user = await getCustomer();
  if (!user) return fail('Please log in to place your order.', 401);
  const method = b.payment_method;
  if (method !== 'cod' && method !== 'online') return fail('Please choose a payment method.');
  const key = typeof b.idempotency_key === 'string' ? b.idempotency_key : '';
  if (!/^[A-Za-z0-9-]{16,64}$/.test(key)) return fail('Invalid request.');
  const it = cleanItems(b.items); if (it.error) return fail(it.error);
  const cu = cleanCustomer(b.customer); if (cu.error) return fail(cu.error);

  const db = admin();
  try {
    // Early, friendly checks. The database function repeats all of them and is the final judge.
    const q = await quote(db, it.items, b.coupon_code, { userId: user.id, phone: cu.value.phone });
    if (q.problems.length) return fail(q.problems[0], 409, { problems: q.problems });
    if (q.couponError) return fail(q.couponError, 409);
    if (method === 'cod' && !q.codAvailable) return fail('Cash on delivery is not available for these items. Please pay online.', 409);
    if (method === 'online' && q.total < 1) return fail('The order total is too low for online payment.', 409);

    const { data, error } = await db.rpc('create_order', { p: {
      idempotency_key: key, user_id: user.id, payment_method: method, customer_name: cu.value.name, customer_email: cu.value.email || null, customer_phone: cu.value.phone,
      shipping_address: cu.value.address, coupon_code: (b.coupon_code || '').toString().slice(0, 40), items: it.items,
    } });
    if (error) {
      if (error.code === 'P0001') return fail(error.message, 409);   // our own messages, e.g. "Only 2 left of Toy Car"
      console.error('create_order failed', error);
      return fail('Could not place your order. Please try again.', 500);
    }

    const base = { order_id: data.order_id, order_number: data.order_number, access_token: data.access_token };
    if (method === 'cod') {
      if (!data.duplicate) after(() => emailOrderConfirmation(data.order_id));   // online orders get theirs once payment is confirmed
      return Response.json({ ...base, method: 'cod' });
    }

    // Online payment: make (or reuse) the Razorpay order for exactly this order's total.
    const { data: row } = await db.from('orders').select('total,payment_status,status,razorpay_order_id').eq('id', data.order_id).single();
    if (row.status === 'cancelled') return fail('This order expired. Please place it again.', 409);
    if (row.payment_status === 'paid') return Response.json({ ...base, method: 'online', paid: true });
    let rzpId = row.razorpay_order_id;
    const amount = Math.round(Number(row.total) * 100);
    if (!rzpId) {
      try {
        const r = await createRzpOrder({ amountPaise: amount, receipt: data.order_number, notes: { order_id: data.order_id } });
        rzpId = r.id;
      } catch (e) {
        console.error('razorpay order failed', e.message);
        await db.rpc('cancel_unpaid_order', { p_order_id: data.order_id, p_reason: 'Could not start payment' });
        return fail('Payment could not be started. Please try again in a minute.', 502);
      }
      await db.from('orders').update({ razorpay_order_id: rzpId }).eq('id', data.order_id);
    }
    return Response.json({ ...base, method: 'online', razorpay_order_id: rzpId, amount, key_id: razorpayKeyId() });
  } catch (e) {
    console.error('checkout failed', e.message);
    return fail('Something went wrong. Please try again.', 500);
  }
}
