import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import BannerSlider from '@/components/BannerSlider';
import { getCategories, getProducts, sortedImages, getBanners } from '@/lib/data';
import { imgUrl } from '@/lib/supabase';
export const revalidate = 300;
export default async function Home() {
  const [cats, featured, latest, banners] = await Promise.all([getCategories(), getProducts({ featured: true, limit: 8 }), getProducts({ sort: 'new', limit: 8 }), getBanners()]);
  const best = featured.length >= 4 ? featured : latest;
  const heroImg = best[0] ? sortedImages(best[0])[0] : null;
  return (<>
    {banners.length > 0 && <section className="wrap" style={{ paddingTop: 20 }}><BannerSlider banners={banners} /></section>}
    <section className="wrap hero">
      <div className="hero-t">
        <span className="chip">New arrivals every week</span>
        <h1>Toys kids love.<br />Quality parents trust.</h1>
        <p>Die-cast models, learning toys, musical toys and more, delivered across India with secure checkout and real support on WhatsApp.</p>
        <div className="row"><Link href="/products" className="btn">Shop all toys</Link><Link href="/products?sort=new" className="btn ghost">New arrivals</Link></div>
      </div>
      {heroImg && <div className="hero-i"><img src={imgUrl(heroImg)} alt={best[0].name} /></div>}
    </section>
    <section className="wrap"><div className="pills">{cats.map((c) => <Link key={c.id} href={`/products?category=${c.slug}`} className="pill">{c.name}</Link>)}</div></section>
    <section className="wrap sec">
      <div className="sec-h"><div><div className="eyebrow">Most loved</div><h2>Best sellers</h2></div><Link href="/products" className="link">View all toys</Link></div>
      <div className="grid">{best.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} />)}</div>
    </section>
    {latest.length > 0 && <section className="wrap sec">
      <div className="sec-h"><div><div className="eyebrow">Just landed</div><h2>New arrivals</h2></div><Link href="/products?sort=new" className="link">See all new</Link></div>
      <div className="grid">{latest.slice(0, 4).map((p) => <ProductCard key={p.id} p={p} />)}</div>
    </section>}
  </>);
}
