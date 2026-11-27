// SERVER ONLY. Talks to Razorpay with plain fetch, so no extra package is needed.
import crypto from 'node:crypto';

const API = 'https://api.razorpay.com/v1';
const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`${k} is not set`); return v.trim(); };
export const razorpayKeyId = () => env('RAZORPAY_KEY_ID');

async function call(path, { method = 'GET', body } = {}) {
  const auth = Buffer.from(`${env('RAZORPAY_KEY_ID')}:${env('RAZORPAY_KEY_SECRET')}`).toString('base64');
  const res = await fetch(API + path, { method, headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(json?.error?.description || `Razorpay error ${res.status}`); e.status = res.status; throw e; }
  return json;
}

export const createRzpOrder = ({ amountPaise, receipt, notes }) => call('/orders', { method: 'POST', body: { amount: amountPaise, currency: 'INR', receipt, notes } });
export const fetchPayment = (id) => call(`/payments/${encodeURIComponent(id)}`);
export const refundPayment = (id, amountPaise, notes) => call(`/payments/${encodeURIComponent(id)}/refund`, { method: 'POST', body: { amount: amountPaise, speed: 'normal', notes } });
export const capturePayment = (id, amountPaise) => call(`/payments/${encodeURIComponent(id)}/capture`, { method: 'POST', body: { amount: amountPaise, currency: 'INR' } });

const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

// Signature Razorpay returns to the browser after a successful payment.
export const verifyCheckoutSignature = (orderId, paymentId, signature) => !!signature && safeEqual(hmac(env('RAZORPAY_KEY_SECRET'), `${orderId}|${paymentId}`), signature);
// Signature on webhook calls (needs the webhook secret you set in the Razorpay dashboard).
export const verifyWebhookSignature = (rawBody, signature) => !!signature && safeEqual(hmac(env('RAZORPAY_WEBHOOK_SECRET'), rawBody), signature);

export const timingSafeStr = safeEqual;
