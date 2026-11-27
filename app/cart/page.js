'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart, lineKey } from '@/components/CartProvider';
import { imgUrl } from '@/lib/supabase';
import { inr } from '@/lib/format';
import PolicyNote from '@/components/PolicyNote';
import FreeToyPicker from '@/components/FreeToyPicker';
export default function CartPage() {
  const { items, setQty, remove, subtotal, ready } = useCart();
  const [q, setQ] = useState(null);
  const [qErr, setQErr] = useState('');
  const sig = JSON.stringify(items.map((i) => [i.productId, i.variantId, i.qty, !!i.free]));
  useEffect(() => {   // real prices and offers from the server (the saved cart can hold an older price)
    if (!ready || !items.length) return;
    let live = true;
    fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items.map((i) => ({ product_id: i.productId, variant_id: i.variantId, quantity: i.qty, free: !!i.free })) }) })
      .then((r) => r.json()).then((d) => { if (!live) return; if (d.error) setQErr(d.error); else { setQErr(''); setQ(d); } }).catch(() => live && setQErr('Could not load prices. Please refresh.'));
    return () => { live = false; };
  }, [ready, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready) return <div className="wrap empty">Loading cart…</div>;
  if (!items.length) return <div className="wrap empty"><h1>Your cart is empty</h1><p>Find something fun for your little one.</p><Link href="/products" className="btn">Shop all toys</Link></div>;
  const lp = (i) => q?.lines.find((l) => l.product_id === i.productId && (l.variant_id || '') === (i.variantId || '') && !!l.free === !!i.free);
  const freeOk = (i) => i.free && q?.offer?.kind === 'deal' && !q.freeInvalid;
  const ship = items.reduce((m, i) => Math.max(m, i.shipping || 0), 0);   // one shipping charge per order: the highest
  return (
    <div className="wrap cart">
      <div className="lines"><h1 style={{ margin: 0 }}>Your cart</h1>
        {items.map((i) => { const k = lineKey(i); return (
          <div className="line" key={k}>
            <img src={imgUrl(i.image)} alt="" />
            <div className="nm"><Link href={`/product/${i.slug}`}>{i.name}</Link>{i.variantName && <div className="muted">{i.variantName}</div>}<div className="muted">{i.free ? <b className="ok">FREE toy</b> : `${inr(lp(i)?.unit_price ?? i.price)} each`}</div></div>
            {i.free ? <div className="qty"><span>Qty {i.qty}</span></div> : <div className="qty"><button onClick={() => setQty(k, i.qty - 1)} aria-label="Less">−</button><span>{i.qty}</span><button onClick={() => setQty(k, i.qty + 1)} aria-label="More">+</button></div>}
            <b>{freeOk(i) ? <><s>{inr(lp(i)?.line_total ?? 0)}</s> FREE</> : i.free ? '' : inr(lp(i)?.line_total ?? i.price * i.qty)}</b><button className="link" onClick={() => remove(k)}>Remove</button>
          </div>); })}
        {qErr && <div className="offer-note info" role="status">{qErr}</div>}
        <FreeToyPicker q={q} />
      </div>
      <aside className="sum"><h2 style={{ margin: 0 }}>Order summary</h2>
        <div className="r"><span>Subtotal</span><span>{inr(q ? q.subtotal : subtotal)}</span></div>
        {q?.discount > 0 && <div className="r"><span>Discount{q.offer?.label ? ` (${q.offer.label})` : ''}</span><span>− {inr(q.discount)}</span></div>}
        <div className="r"><span>Shipping{q ? '' : ' (estimate)'}</span><span>{(q ? q.shipping : ship) ? inr(q ? q.shipping : ship) : 'Free'}</span></div>
        <div className="r t"><span>Total</span><span>{inr(q ? q.total : subtotal + ship)}</span></div>
        <Link href="/checkout" className="btn">Proceed to checkout</Link>
        <PolicyNote />
        <div className="muted">Final price, shipping and any coupon are confirmed securely at checkout.</div>
      </aside>
    </div>
  );
}
