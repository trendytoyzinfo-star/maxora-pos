import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import BannerSlider from '@/components/BannerSlider';
import CategoryStrip from '@/components/CategoryStrip';
import { getCategoriesWithImages, getProducts, getBanners } from '@/lib/data';
export const revalidate = 300;
export default async function Home() {
  const [cats, featured, all, banners] = await Promise.all([getCategoriesWithImages(), getProducts({ featured: true, limit: 10 }), getProducts({ sort: 'new', limit: 30 }), getBanners()]);
  const row = (title, items, href, tone) => items.length > 0 && <section className={`panel band ${tone}`}>
    <div className="panel-h"><h2>{title}</h2><Link href={href} className="btn sm">View all</Link></div>
    <div className="hrow">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
  </section>;
  return (
    <div className="shop">
      <h1 className="sr">TrendyToyz: toys for kids, delivered across India</h1>
      <CategoryStrip cats={cats} current="none" />
      {banners.length > 0 && <BannerSlider banners={banners} />}
      <ul className="trust"><li><i>🚚</i>Delivery across India</li><li><i>🔒</i>Secure payments</li><li><i>💬</i>WhatsApp support</li><li><i>↩️</i>Return requests online</li></ul>
      {row('🔥 Best sellers', featured.length ? featured : all.slice(0, 10), '/products', 'warm')}
      <section className="panel">
        <div className="panel-h"><h2>Shop by budget</h2></div>
        <div className="budget">{[499, 999, 1999, 4999].map((n) => <Link key={n} href={`/products?max=${n}`}><small>Toys under</small><b>₹{n.toLocaleString('en-IN')}</b><span>Shop now →</span></Link>)}</div>
      </section>
      {row('✨ New arrivals', all.slice(0, 10), '/products?sort=new', 'cool')}
      {all.length > 0 && <section className="panel">
        <div className="panel-h"><h2>Toys for you</h2><Link href="/products" className="btn sm">View all</Link></div>
        <div className="grid">{all.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      </section>}
    </div>
  );
}
