// SERVER ONLY. A tiny PDF writer (no npm package needed). Standard Helvetica fonts only.
// Characters outside basic Latin are replaced (Rs. for the rupee sign, ? for scripts the PDF font cannot draw).
const WR = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500];
const WB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 761, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556];
const MAP = { '\u20B9': 'Rs.', '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2013': '-', '\u2014': '-', '\u2022': '*', '\u2026': '...', '\u00A0': ' ' };
export function clean(s) {
  let out = '';
  for (const ch of String(s ?? '').replace(/\r?\n/g, ' ')) {
    if (MAP[ch]) { out += MAP[ch]; continue; }
    const c = ch.codePointAt(0);
    out += (c >= 32 && c <= 126) || (c >= 161 && c <= 255) ? ch : (c < 32 ? ' ' : '?');
  }
  return out;
}
export function width(s, size, bold) {
  const t = bold ? WB : WR; let w = 0;
  for (const ch of clean(s)) { const c = ch.charCodeAt(0); w += t[c - 32] ?? 556; }
  return (w * size) / 1000;
}
// Breaks text into lines that fit maxW. Very long words are cut.
export function wrap(s, size, maxW, bold) {
  const words = clean(s).split(/\s+/).filter(Boolean), lines = []; let cur = '';
  for (let w of words) {
    while (width(w, size, bold) > maxW) { let k = w.length; while (k > 1 && width(w.slice(0, k), size, bold) > maxW) k--; if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, k)); w = w.slice(k); }
    const t = cur ? cur + ' ' + w : w;
    if (width(t, size, bold) <= maxW) cur = t; else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
const esc = (s) => clean(s).replace(/([\\()])/g, '\\$1');
const n = (x) => (Math.round(x * 100) / 100).toString();
export class Pdf {
  constructor(w, h) { this.w = w; this.h = h; this.pages = []; this.addPage(); }
  addPage() { this.ops = []; this.pages.push(this.ops); }
  // y is measured from the TOP of the page.
  text(x, y, s, { size = 10, bold = false, align = 'left', gray = 0 } = {}) {
    let px = x; const tw = width(s, size, bold);
    if (align === 'right') px = x - tw; else if (align === 'center') px = x - tw / 2;
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(gray)} g ${n(px)} ${n(this.h - y)} Td (${esc(s)}) Tj ET`);
  }
  line(x1, y1, x2, y2, lw = 0.7, gray = 0) { this.ops.push(`${n(lw)} w ${n(gray)} G ${n(x1)} ${n(this.h - y1)} m ${n(x2)} ${n(this.h - y2)} l S`); }
  rect(x, y, w, h, { fill = null, stroke = true, lw = 0.7 } = {}) {   // (x, y) is the top-left corner
    const op = fill != null && stroke ? 'B' : fill != null ? 'f' : 'S';
    this.ops.push(`${fill != null ? n(fill) + ' g ' : ''}0 G ${n(lw)} w ${n(x)} ${n(this.h - y - h)} ${n(w)} ${n(h)} re ${op}`);
  }
  build() {
    const objs = [], add = (s) => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>'); add('PAGES');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const ops of this.pages) {
      const body = Buffer.from(ops.join('\n'), 'latin1');
      const c = add(Buffer.concat([Buffer.from(`<< /Length ${body.length} >>\nstream\n`), body, Buffer.from('\nendstream')]));
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(this.w)} ${n(this.h)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${c} 0 R >>`));
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    const parts = [Buffer.from('%PDF-1.4\n')], offs = []; let pos = parts[0].length;
    objs.forEach((o, i) => { offs.push(pos); const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.isBuffer(o) ? o : Buffer.from(o, 'latin1'), Buffer.from('\nendobj\n')]); parts.push(b); pos += b.length; });
    const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n')].join('');
    parts.push(Buffer.from(xref + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
    return Buffer.concat(parts);
  }
}
