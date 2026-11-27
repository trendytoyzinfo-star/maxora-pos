'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { imgUrl } from '@/lib/supabase';
// Home page banners. With 2 or more banners they slide by themselves every 5 seconds (pauses when the mouse is over it).
export default function BannerSlider({ banners }) {
  const [i, setI] = useState(0), [pause, setPause] = useState(false), x0 = useRef(null), n = banners.length;
  useEffect(() => { if (n < 2 || pause) return; const t = setInterval(() => setI((v) => (v + 1) % n), 5000); return () => clearInterval(t); }, [n, pause, i]);
  const go = (d) => setI((v) => (v + d + n) % n);
  return (
    <div className="bnr" onMouseEnter={() => setPause(true)} onMouseLeave={() => setPause(false)} onTouchStart={(e) => { x0.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (x0.current == null) return; const d = e.changedTouches[0].clientX - x0.current; x0.current = null; if (Math.abs(d) > 40) go(d < 0 ? 1 : -1); }}>
      {banners.map((b, k) => {
        const inner = <><img src={imgUrl(b.image_path)} alt={b.title || 'Banner'} loading={k === 0 ? 'eager' : 'lazy'} />
          {(b.title || b.subtitle || b.button_text) && <div className="bnr-t">{b.title && <h2>{b.title}</h2>}{b.subtitle && <p>{b.subtitle}</p>}{b.button_text && <span className="btn">{b.button_text}</span>}</div>}</>;
        const cls = 'bnr-s' + (k === i ? ' on' : '');
        return !b.link_url ? <div key={b.id} className={cls} aria-hidden={k !== i}>{inner}</div>
          : b.link_url.startsWith('/') ? <Link key={b.id} href={b.link_url} className={cls} tabIndex={k === i ? 0 : -1}>{inner}</Link>
          : <a key={b.id} href={b.link_url} className={cls} tabIndex={k === i ? 0 : -1} rel="noopener noreferrer">{inner}</a>;
      })}
      {n > 1 && <><button className="bnr-a l" onClick={() => go(-1)} aria-label="Previous banner">‹</button><button className="bnr-a r" onClick={() => go(1)} aria-label="Next banner">›</button>
        <div className="bnr-d">{banners.map((b, k) => <button key={b.id} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Banner ${k + 1}`} />)}</div></>}
    </div>
  );
}
