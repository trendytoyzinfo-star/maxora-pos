'use client';
import { useEffect, useRef, useState } from 'react';
// Product photo that slides through the toy's other photos: mouse over it (computer), or press and hold it (phone).
export default function CardImages({ images, alt, children }) {
  const [i, setI] = useState(0), [on, setOn] = useState(false);
  const timer = useRef(null), hold = useRef(null), held = useRef(false);
  const start = () => { if (images.length < 2 || timer.current) return; setOn(true); setI(1); timer.current = setInterval(() => setI((n) => (n + 1) % images.length), 900); };
  const stop = () => { clearInterval(timer.current); timer.current = null; clearTimeout(hold.current); setI(0); };
  useEffect(() => () => { clearInterval(timer.current); clearTimeout(hold.current); }, []);
  const touch = (e) => e.pointerType !== 'mouse';
  return (
    <div className="card-img" onPointerEnter={(e) => { if (!touch(e)) start(); }} onPointerLeave={(e) => { if (!touch(e)) stop(); }}
      onPointerDown={(e) => { if (touch(e)) hold.current = setTimeout(() => { held.current = true; start(); }, 300); }}
      onPointerUp={(e) => { if (touch(e)) { clearTimeout(hold.current); if (timer.current) stop(); } }} onPointerCancel={stop}
      onClickCapture={(e) => { if (held.current) { e.preventDefault(); e.stopPropagation(); held.current = false; } }}
      onContextMenu={(e) => { if (touch(e.nativeEvent) || timer.current) e.preventDefault(); }}>
      {(on ? images : images.slice(0, 1)).map((u, n) => <img key={u + n} src={u} alt={n === 0 ? alt : ''} draggable={false} loading="lazy" className={'ci' + (n === i ? ' on' : '')} />)}
      {on && images.length > 1 && <span className="dots">{images.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</span>}
      {children}
    </div>
  );
}
