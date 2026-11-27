'use client';
import { useEffect, useState } from 'react';
import { useCart, lineKey } from './CartProvider';
import { imgUrl } from '@/lib/supabase';
import { inr } from '@/lib/format';
// "Free toys" (Buy X Get Y Free).
//  1) Free toys the customer did NOT choose are added automatically: the SAME toy he bought (shown first, "added for you").
//  2) He can claim other toys instead. Every toy he claims replaces one automatic toy.
export default function FreeToyPicker({ q }) {
  const { items, add, remove } = useCart();
  const [msg, setMsg] = useState('');
  useEffect(() => {   // the server says the free toys are not valid any more (cart changed, or a coupon saves more): take them out
    if (!q?.freeInvalid) return;
    const free = items.filter((i) => i.free);
    if (free.length) { free.forEach((i) => remove(lineKey(i))); setMsg(q.freeMsg || 'Your free toys were removed because your cart changed.'); }
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = q?.claim;
  const left = c ? c.allowed - c.chosen : 0;
  const autos = (q?.lines || []).filter((l) => l.auto);
  const pick = (o) => add({ productId: o.product_id, slug: o.slug, name: o.name, price: o.price, mrp: 0, image: o.image, variantId: o.variant_id, variantName: o.variant_name, shipping: 0, maxQty: Math.min(o.stock, 20), free: true }, 1);
  return (<>
    {msg && <div className="offer-note info" role="status">{msg}</div>}
    {autos.length > 0 && <div className="box freebox">
      <b>🎁 {c?.deal || 'Free toys'}: your free toys</b>
      <div className="muted">You did not choose, so we added the same toy you bought, free. Want something else? Claim it below and it replaces one of these.</div>
      <div className="free-list">
        {autos.map((a) => (
          <div className="free-it" key={a.product_id + a.variant_id}>
            <img src={imgUrl(a.image)} alt="" loading="lazy" />
            <div className="nm">{a.name}{a.variant_name && <div className="muted">{a.variant_name}</div>}<div className="muted">Qty {a.quantity} · <s>{inr(a.line_total)}</s> <b className="ok">FREE</b> · same as yours</div></div>
          </div>))}
      </div>
    </div>}
    {c && (left <= 0
      ? <div className="offer-note">🎁 {c.deal}: all your free toys are chosen.</div>
      : <div className="box freebox">
        <b>🎁 {c.deal}: {autos.length ? `change up to ${left} free toy${left > 1 ? 's' : ''}` : `choose ${left} free toy${left > 1 ? 's' : ''}`}</b>
        <div className="muted">The same toy you bought is always free to pick. Other toys can be up to {inr(c.left)} worth in total.{q?.coupon ? ' You can use either your coupon or the free toys, not both.' : ''}</div>
        <div className="free-list">
          {c.options.map((o) => (
            <div className="free-it" key={o.product_id + o.variant_id}>
              <img src={imgUrl(o.image)} alt="" loading="lazy" />
              <div className="nm">{o.name}{o.variant_name && <div className="muted">{o.variant_name}</div>}<div className="muted"><s>{inr(o.price)}</s> <b className="ok">FREE</b>{o.same && ' · same as yours'}</div></div>
              <button type="button" className="btn ghost" style={{ minHeight: 36, padding: '0 14px' }} onClick={() => pick(o)}>Claim</button>
            </div>))}
          {!c.options.length && <div className="muted">No toys are available to claim right now.</div>}
        </div>
      </div>)}
  </>);
}
