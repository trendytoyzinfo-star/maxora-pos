import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import CategoryStrip from '@/components/CategoryStrip';
import { getCategoriesWithImages, getProducts } from '@/lib/data';
export const revalidate = 300;
export const metadata = { title: 'All Toys', description: 'Browse die-cast models, learning toys, musical toys and more at TrendyToyz.' };
export default async function Products({ searchParams }) {
  const sp = await searchParams;
  const category = sp.category || '', q = (sp.q || '').toString().slice(0, 60), sort = sp.sort || 'new';
  const max = Number(sp.max) > 0 ? Math.floor(Number(sp.max)) : 0;   // "Shop by budget"
  const [cats, found] = await Promise.all([getCategoriesWithImages(), getProducts({ category, q, sort })]);
  const items = max ? found.filter((p) => Number(p.price) <= max) : found;
  const href = (o) => { const u = new URLSearchParams({ ...(category && { category }), ...(q && { q }), ...(max && { max }), sort, ...o }); return `/products?${u}`; };
  const active = cats.find((c) => c.slug === category);
  return (
    <div className="shop">
      <CategoryStrip cats={cats} current={category} />
      <div className="listing">
        <aside className="panel side"><h2>Categories</h2>
          <Link href="/products" className={!category ? 'on' : ''}>All toys</Link>
          {cats.map((c) => <Link key={c.id} href={`/products?category=${c.slug}`} className={c.slug === category ? 'on' : ''}>{c.name}</Link>)}
        </aside>
        <section className="panel">
          <div className="panel-h"><h1>{q ? `Results for “${q}”` : active ? active.name : max ? `Toys under ₹${max.toLocaleString('en-IN')}` : 'All toys'} <small>({items.length})</small></h1></div>
          <div className="sort">Sort by: {[['new', 'Newest'], ['low', 'Price: low to high'], ['high', 'Price: high to low']].map(([k, l]) => <Link key={k} href={href({ sort: k })} className={sort === k ? 'on' : ''}>{l}</Link>)}</div>
          {items.length ? <div className="grid">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div> : <div className="empty">No toys found. Try another search or category.</div>}
        </section>
      </div>
    </div>
  );
}
