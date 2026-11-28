import Link from 'next/link';
import { imgUrl } from '@/lib/supabase';
// Round category shortcuts. Pictures come from Admin -> Categories.
export default function CategoryStrip({ cats, current = '' }) {
  const item = (key, href, name, img) => (
    <Link key={key} href={href} className={'cat' + (current === key ? ' on' : '')}>
      <span className="cat-i">{img ? <img src={imgUrl(img)} alt="" /> : <b>{key ? name.charAt(0) : '🧸'}</b>}</span><span>{name}</span>
    </Link>
  );
  return <nav className="panel cats" aria-label="Categories">{item('', '/products', 'All toys')}{cats.map((c) => item(c.slug, `/products?category=${c.slug}`, c.name, c.image_path))}</nav>;
}
