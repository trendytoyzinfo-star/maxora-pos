'use client';
import { useRef, useState } from 'react';
// Shrinks photos to 1200px WebP in the browser before upload (fast, small, and fits the server upload limit). Shows small previews.
export default function ImagePicker({ name = 'images', multiple = true, max = 10, required = false, label, maxSize = 1200 }) {
  const ref = useRef(null);
  const [info, setInfo] = useState('');
  const [prev, setPrev] = useState([]);
  async function onPick(e) {
    const files = [...e.target.files].slice(0, multiple ? max : 1);
    if (!files.length) { setPrev([]); setInfo(''); return; }
    setInfo('Preparing images…');
    const dt = new DataTransfer();
    for (const f of files) {
      try {
        const bmp = await createImageBitmap(f);
        const s = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.82));
        if (blob) dt.items.add(new File([blob], f.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' }));
      } catch { /* skip a file the browser cannot read */ }
    }
    if (ref.current) ref.current.files = dt.files;
    setPrev([...dt.files].map((f) => URL.createObjectURL(f)));
    setInfo(dt.files.length ? `${dt.files.length} photo(s) ready to upload.` : 'Could not read these images. Try JPG or PNG.');
  }
  return (
    <div className="pick">
      <input ref={ref} name={name} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} required={required} onChange={onPick} aria-label={label || 'Choose photos'} />
      {prev.length > 0 && <div className="pick-prev">{prev.map((u, i) => <img key={i} src={u} alt="" />)}</div>}
      {info && <div className="muted">{info}</div>}
    </div>
  );
}
