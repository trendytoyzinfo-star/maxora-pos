'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from './CartProvider';
import { inr, deal } from '@/lib/format';
import PolicyNote from './PolicyNote';
import { imgUrl } from '@/lib/supabase';
export default function ProductBuy({ p, images }) {
  const { add } = useCart();
  const router = useRouter();
  const variants = (p.variants || []).filter((v) => v.is_active !== false);
  const [vid, setVid] = useState((variants.find((x) => x.stock > 0) || variants[0])?.id || '');
  const [qty, setQty] = useState(1);
  const [sel, setSel] = useState(0);
  const [added, setAdded] = useState(false);
  const v = variants.find((x) => x.id === vid);
  const price = v?.price ?? p.price, mrp = v?.mrp ?? p.mrp, was = v?.price != null ? v.was_price : p.was_price, stock = v ? v.stock : p.stock, { strike, pct: d } = deal(price, mrp, was);
  const addNow = () => {
    add({ productId: p.id, slug: p.slug, name: p.name, price, mrp: strike || mrp, image: images[0] || null, variantId: v?.id || '', variantName: v?.name || '', shipping: p.shipping_charge, maxQty: Math.min(stock, 20) }, qty);
    setAdded(true); setTimeout(() => setAdded(false), 1800);
  };
  return (
    <div className="pdp wrap">
      <div className="gal">
        <img className="gal-main" src={imgUrl(images[sel])} alt={p.name} />
        <div className="thumbs">{images.map((im, i) => <button key={im} onClick={() => setSel(i)} className={i === sel ? 'on' : ''} aria-label={`Photo ${i + 1}`}><img src={imgUrl(im)} alt="" loading="lazy" /></button>)}</div>
      </div>
      <div className="info">
        <div className="eyebrow">{p.categories?.name}</div>
        <h1>{p.name}</h1>
        <div className="price big"><b>{inr(price)}</b>{strike > 0 && <s>{inr(strike)}</s>}{d > 0 && <span className="badge in">{d}% OFF</span>}</div>
        <div className="muted">Inclusive of all taxes{p.shipping_charge > 0 ? ` · Shipping ${inr(p.shipping_charge)}` : ' · Free shipping'}</div>
        {variants.length > 0 && <div className="opts"><div className="lbl">Choose option</div>{variants.map((x) => <button key={x.id} onClick={() => { setVid(x.id); setQty(1); }} disabled={x.stock < 1} className={'opt' + (x.id === vid ? ' on' : '')}>{x.name}</button>)}</div>}
        {stock > 0 ? (<>
          <div className="qty"><button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Less">−</button><span>{qty}</span><button onClick={() => setQty(Math.min(Math.min(stock, 20), qty + 1))} aria-label="More">+</button>{stock <= 5 && <em>Only {stock} left</em>}</div>
          <div className="actions"><button className="btn b-add" onClick={addNow}>{added ? 'Added to cart' : 'Add to cart'}</button><button className="btn b-buy" onClick={() => { addNow(); router.push('/cart'); }}>Buy now</button></div></>
        ) : <div className="soldmsg">Currently sold out</div>}
        {p.short_description && <p className="short">{p.short_description}</p>}
        {p.age_group && <div className="meta"><b>Age:</b> {p.age_group}</div>}
        {p.in_package && <div className="meta"><b>In the box:</b> {p.in_package}</div>}
        <PolicyNote />
        {p.description && <div className="desc"><h2>About this toy</h2><p>{p.description}</p></div>}
      </div>
    </div>
  );
}
