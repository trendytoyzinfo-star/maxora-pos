import { notFound } from 'next/navigation';
import ProductBuy from '@/components/ProductBuy';
import { getProduct, sortedImages, available } from '@/lib/data';
import { imgUrl } from '@/lib/supabase';
import { SITE } from '@/lib/format';
export const revalidate = 300;
export async function generateMetadata({ params }) {
  const { slug } = await params; const p = await getProduct(slug);
  if (!p) return {};
  const desc = (p.short_description || p.description || '').replace(/\s+/g, ' ').slice(0, 155);
  const img = sortedImages(p)[0];
  return { title: p.seo_title ? p.seo_title.slice(0, 65) : p.name, description: desc, alternates: { canonical: `/product/${p.slug}` }, openGraph: { title: p.name, description: desc, images: img ? [imgUrl(img)] : [] } };
}
export default async function ProductPage({ params }) {
  const { slug } = await params; const p = await getProduct(slug);
  if (!p) notFound();
  const images = sortedImages(p);
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.name, image: images.map(imgUrl), description: (p.short_description || p.description || '').slice(0, 300), sku: p.sku || undefined, brand: { '@type': 'Brand', name: p.brand || 'TrendyToyz' },
    offers: { '@type': 'Offer', url: `${SITE}/product/${p.slug}`, priceCurrency: 'INR', price: p.price, availability: available(p) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' } };
  return (<><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} /><ProductBuy p={p} images={images} /></>);
}
