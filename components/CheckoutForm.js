'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart, lineKey } from './CartProvider';
import FreeToyPicker from './FreeToyPicker';
import { imgUrl } from '@/lib/supabase';
import { inr } from '@/lib/format';
import { STATES } from '@/lib/validate';
import PolicyNote from './PolicyNote';

const EMPTY = { name: '', phone: '', email: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '' };
const newKey = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2) + '00000000');

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve; s.onerror = () => reject(new Error('Could not load the payment window. Check your internet and try again.'));
    document.body.appendChild(s);
  });
}

export default function CheckoutForm({ user }) {
  const { items, ready, setQty, remove } = useCart();
  const router = useRouter();
  const [f, setF] = useState({ ...EMPTY, name: user?.name || '', phone: user?.phone || '', email: user?.email || '' });
  const [method, setMethod] = useState('online');
  const [q, setQ] = useState(null);
  const [qErr, setQErr] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [retry, setRetry] = useState(null);   // set when the payment window was closed, so the shopper can pay the same order again
  const key = useRef(null);

  const sig = JSON.stringify(items.map((i) => [i.productId, i.variantId, i.qty, !!i.free]));
  useEffect(() => { // ask the server for real prices whenever the cart or coupon changes
    if (!ready || !items.length) return;
    let live = true;
    fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items.map((i) => ({ product_id: i.productId, variant_id: i.variantId, quantity: i.qty, free: !!i.free })), coupon_code: coupon }) })
      .then((r) => r.json()).then((d) => { if (!live) return; if (d.error) { setQErr(d.error); return; } setQErr(''); setQ(d); })
      .catch(() => live && setQErr('Could not load prices. Please refresh.'));
    return () => { live = false; };
  }, [ready, sig, coupon]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { key.current = null; setRetry(null); }, [sig, coupon, method]);   // a changed order must get a new order key
  useEffect(() => { if (q && !q.codAvailable && method === 'cod') setMethod('online'); }, [q, method]);

  const set = (k) => (e) => { key.current = null; setRetry(null); setF((s) => ({ ...s, [k]: e.target.value })); };   // edited details = a new order
  const applyCoupon = (e) => { e.preventDefault(); setCoupon(couponInput.trim().toUpperCase()); };

  if (!ready) return <div className="wrap empty">Loading…</div>;
  if (!items.length) return <div className="wrap empty"><h1>Your cart is empty</h1><Link href="/products" className="btn">Shop all toys</Link></div>;

  const lineFor = (i) => q?.lines.find((l) => l.product_id === i.productId && (l.variant_id || '') === (i.variantId || '') && !!l.free === !!i.free);
  const blocked = !q || q.problems.length > 0;

  const finish = (d) => {
    try { localStorage.setItem('tt_pending_order', d.order_id); } catch {}
    router.push(`/order/${d.order_id}?t=${d.access_token}`);
  };

  async function openPayment(d) {
    await loadRazorpay();
    let paidNow = false;
    const rz = new window.Razorpay({
      key: d.key_id, order_id: d.razorpay_order_id, amount: d.amount, currency: 'INR', name: 'TrendyToyz', description: `Order ${d.order_number}`,
      prefill: { name: f.name, email: f.email, contact: f.phone }, theme: { color: '#4F46E5' },
      handler: async (resp) => {
        paidNow = true; setBusy(true);
        try {
          await fetch('/api/payment/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: d.order_id, access_token: d.access_token, ...resp }) });
        } catch {}
        finish(d);   // the order page keeps checking until the payment is confirmed
      },
      modal: { ondismiss: () => { if (paidNow) return; setBusy(false); setRetry(d); setErr('Payment was not completed. You can try again.'); } },
    });
    rz.on('payment.failed', (r) => setErr(r?.error?.description || 'Payment failed. Please try again.'));
    rz.open();
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr(''); setBusy(true);
    try {
      if (!key.current) key.current = newKey();
      const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        idempotency_key: key.current, payment_method: method, coupon_code: q?.coupon ? coupon : '', customer: f,
        items: items.map((i) => ({ product_id: i.productId, variant_id: i.variantId, quantity: i.qty, free: !!i.free })),
      }) });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401) { router.push('/login?next=/checkout'); return; }
      if (!res.ok) { key.current = null; setErr(d.error || 'Could not place your order.'); setBusy(false); return; }
      if (d.method === 'cod' || d.paid) return finish(d);
      await openPayment(d); setBusy(false);
    } catch (x) { setErr(x.message || 'Something went wrong. Please try again.'); setBusy(false); }
  }

  const total = q ? q.total : 0;
  return (
    <form className="wrap cart" onSubmit={submit} noValidate>
      <div className="lines">
        <h1 style={{ margin: 0 }}>Checkout</h1>
        <fieldset className="box"><legend>Contact</legend>
          <label>Full name<input value={f.name} onChange={set('name')} autoComplete="name" required /></label>
          <div className="two"><label>Mobile number<input value={f.phone} onChange={set('phone')} inputMode="numeric" autoComplete="tel" placeholder="10-digit number" required /></label>
            <label>Email (optional)<input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></label></div>
        </fieldset>
        <fieldset className="box"><legend>Delivery address</legend>
          <label>House no., building, street<input value={f.line1} onChange={set('line1')} autoComplete="address-line1" required /></label>
          <label>Area, locality (optional)<input value={f.line2} onChange={set('line2')} autoComplete="address-line2" /></label>
          <label>Landmark (optional)<input value={f.landmark} onChange={set('landmark')} /></label>
          <div className="two"><label>City<input value={f.city} onChange={set('city')} autoComplete="address-level2" required /></label>
            <label>Pincode<input value={f.pincode} onChange={set('pincode')} inputMode="numeric" maxLength={6} autoComplete="postal-code" required /></label></div>
          <label>State<select value={f.state} onChange={set('state')} autoComplete="address-level1" required><option value="">Choose state</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
        </fieldset>
        <fieldset className="box"><legend>Payment</legend>
          <label className="radio"><input type="radio" name="pm" checked={method === 'online'} onChange={() => setMethod('online')} /> <span><b>Pay online</b><small>UPI, cards, net banking, wallets (secured by Razorpay)</small></span></label>
          {q?.codAvailable && <label className="radio"><input type="radio" name="pm" checked={method === 'cod'} onChange={() => setMethod('cod')} /> <span><b>Cash on delivery</b><small>Pay when your order arrives</small></span></label>}
          {q && !q.codAvailable && <div className="muted">Cash on delivery is not available for one or more items in your cart.</div>}
        </fieldset>
      </div>

      <aside className="sum"><h2 style={{ margin: 0 }}>Order summary</h2>
        {items.map((i) => { const l = lineFor(i), k = lineKey(i); return (
          <div className="mini" key={k}>
            <img src={imgUrl(i.image)} alt="" />
            <div className="nm"><div>{i.name}</div>{i.variantName && <div className="muted">{i.variantName}</div>}
              <div className="muted">Qty {i.qty}{l?.unit_price != null && ` × ${inr(l.unit_price)}`}{l?.was_price != null && <s style={{ marginLeft: 6 }}>{inr(l.was_price)}</s>}</div>
              {l?.problem && <div className="bad">{l.problem}. <button type="button" className="link" onClick={() => (l.stock > 0 ? setQty(lineKey(i), l.stock) : remove(lineKey(i)))}>{l.stock > 0 ? 'Use ' + l.stock : 'Remove'}</button></div>}</div>
            <b>{i.free && q?.offer?.kind === 'deal' && !q.freeInvalid ? <><s>{inr(l?.line_total ?? 0)}</s> FREE</> : l?.line_total != null && !i.free ? inr(l.line_total) : ''}</b>
          </div>); })}
        <FreeToyPicker q={q} />
        <div className="coupon"><input value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="Coupon code" aria-label="Coupon code" /><button className="btn ghost" onClick={applyCoupon} type="button" style={{ minHeight: 44, padding: '0 18px' }}>Apply</button></div>
        {q?.couponError && <div className="bad">{q.couponError}</div>}
        {q?.offer && <div className="offer-note">Offer applied: <b>{q.offer.label}</b></div>}
        {q?.notice && <div className="offer-note info">{q.notice}</div>}
        {q ? <>
          <div className="r"><span>Subtotal</span><span>{inr(q.subtotal)}</span></div>
          {q.discount > 0 && <div className="r"><span>Discount{q.offer?.label ? ` (${q.offer.label})` : ''}</span><span>− {inr(q.discount)}</span></div>}
          <div className="r"><span>Shipping</span><span>{q.shipping ? inr(q.shipping) : 'Free'}</span></div>
          {q.freeShippingAbove != null && q.shipping > 0 && <div className="muted">Add {inr(q.freeShippingAbove - q.subtotal)} more for free shipping.</div>}
          <div className="r t"><span>Total</span><span>{inr(total)}</span></div>
        </> : <div className="muted">{qErr || 'Calculating…'}</div>}
        {err && <div className="bad" role="alert">{err}</div>}
        {retry && <button type="button" className="btn" disabled={busy} onClick={() => { setErr(''); setBusy(true); openPayment(retry).catch((x) => setErr(x.message)).finally(() => setBusy(false)); }}>Pay {inr(retry.amount / 100)} again</button>}
        {!retry && <button className="btn" type="submit" disabled={busy || blocked}>{busy ? 'Please wait…' : method === 'cod' ? 'Place order' : `Pay ${q ? inr(total) : ''}`}</button>}
        <PolicyNote />
        <div className="muted">By placing your order you agree to our store policies. Your payment details never touch our servers.</div>
        <Link href="/cart" className="link">Back to cart</Link>
      </aside>
    </form>
  );
}
