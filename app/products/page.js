import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import { getCategories, getProducts } from '@/lib/data';
export const revalidate = 300;
export const metadata = { title: 'All Toys', description: 'Browse die-cast models, learning toys, musical toys and more at TrendyToyz.' };
export default async function Products({ searchParams }) {
  const sp = await searchParams;
  const category = sp.category || '', q = (sp.q || '').toString().slice(0, 60), sort = sp.sort || 'new';
  const [cats, items] = await Promise.all([getCategories(), getProducts({ category, q, sort })]);
  const href = (o) => { const u = new URLSearchParams({ ...(category && { category }), ...(q && { q }), sort, ...o }); return `/products?${u}`; };
  const active = cats.find((c) => c.slug === category);
  return (<>
    <div className="wrap page-h"><h1>{q ? `Results for “${q}”` : active ? active.name : 'All toys'}</h1><div className="muted">{items.length} toys</div></div>
    <div className="wrap">
      <div className="pills"><Link href="/products" className={'pill' + (!category ? ' on' : '')}>All</Link>{cats.map((c) => <Link key={c.id} href={`/products?category=${c.slug}`} className={'pill' + (c.slug === category ? ' on' : '')}>{c.name}</Link>)}</div>
      <div className="sort">Sort by: {[['new', 'Newest'], ['low', 'Price: low to high'], ['high', 'Price: high to low']].map(([k, l]) => <Link key={k} href={href({ sort: k })} className={sort === k ? 'on' : ''}>{l}</Link>)}</div>
      {items.length ? <div className="grid" style={{ paddingBottom: 48 }}>{items.map((p) => <ProductCard key={p.id} p={p} />)}</div> : <div className="empty">No toys found. Try another search or category.</div>}
    </div>
  </>);
}
