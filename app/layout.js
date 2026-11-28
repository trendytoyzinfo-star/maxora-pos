import './globals.css';
import { Outfit, Inter } from 'next/font/google';
import { CartProvider } from '@/components/CartProvider';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { SITE } from '@/lib/format';
import Link from 'next/link';
import AnnouncementBar from '@/components/AnnouncementBar';
import { getBiz } from '@/lib/storeInfo';
import { admin } from '@/lib/supabaseAdmin';
import { imgUrl } from '@/lib/supabase';
const outfit = Outfit({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--f-head', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--f-body', display: 'swap' });
// Announcement bar, favicon and store details are set in Admin -> Site.
async function siteSettings() {
  try { const { data } = await admin().from('store_settings').select('announcement_text,announcement_link,announcement_active,favicon_path').eq('id', 1).maybeSingle(); return data || {}; } catch { return {}; }
}
const base = {
  metadataBase: new URL(SITE),
  title: { default: 'TrendyToyz | Toys for Kids, Delivered Across India', template: '%s | TrendyToyz' },
  description: 'Die-cast models, learning toys, musical toys and more. Secure checkout and WhatsApp support. Delivered across India.',
  openGraph: { siteName: 'TrendyToyz', type: 'website', locale: 'en_IN' },
};
export async function generateMetadata() {
  const st = await siteSettings();
  return st.favicon_path ? { ...base, icons: { icon: imgUrl(st.favicon_path), shortcut: imgUrl(st.favicon_path), apple: imgUrl(st.favicon_path) } } : base;
}
export default async function RootLayout({ children }) {
  const [st, BIZ] = await Promise.all([siteSettings(), getBiz()]);
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <body>
        <CartProvider>
          {st.announcement_active && <AnnouncementBar text={st.announcement_text} link={st.announcement_link} />}
          <Header />
          <main>{children}</main>
          <footer className="ftr"><div className="wrap ftr-in">
            <div><div className="logo light">Trendy<span>Toyz</span></div><p>India&apos;s online toy store.</p></div>
            <div><p>WhatsApp: {BIZ.whatsapp}<br />{BIZ.email}<br />{BIZ.hours}</p></div>
            <nav className="ftr-links" aria-label="Policies"><Link href="/terms">Terms &amp; Conditions</Link><Link href="/privacy-policy">Privacy Policy</Link><Link href="/refund-policy">Refund &amp; Return Policy</Link><Link href="/shipping-policy">Shipping Policy</Link><Link href="/contact">Contact Us</Link></nav>
            <div className="copy">© {new Date().getFullYear()} TrendyToyz. All rights reserved.</div>
          </div></footer>
          <BottomNav />
        </CartProvider>
      </body>
    </html>
  );
}
