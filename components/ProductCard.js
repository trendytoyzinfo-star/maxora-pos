import Link from 'next/link';
import { imgUrl } from '@/lib/supabase';
import { sortedImages, available } from '@/lib/data';
import { inr, deal } from '@/lib/format';
import CardImages from './CardImages';
export default function ProductCard({ p }) {
  const { strike, pct: d } = deal(p.price, p.mrp, p.was_price), imgs = sortedImages(p).slice(0, 6).map(imgUrl);
  return (
    <Link href={`/product/${p.slug}`} className="card">
      <CardImages images={imgs.length ? imgs : [imgUrl(null)]} alt={p.name}>{d > 0 && <span className="badge">{d}% OFF</span>}{!available(p) && <span className="badge sold">Sold out</span>}</CardImages>
      <div className="card-b"><div className="eyebrow">{p.categories?.name}</div><h3>{p.name}</h3>
        <div className="price"><b>{inr(p.price)}</b>{strike > 0 && <s>{inr(strike)}</s>}</div></div>
    </Link>
  );
}
