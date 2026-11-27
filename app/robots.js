import { SITE } from '@/lib/format';
export default function robots() { return { rules: { userAgent: '*', allow: '/', disallow: ['/cart', '/checkout', '/order', '/admin', '/api'] }, sitemap: `${SITE}/sitemap.xml` }; }
