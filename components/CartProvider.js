'use client';
import { createContext, useContext, useEffect, useState } from 'react';
const Ctx = createContext(null);
export const useCart = () => useContext(Ctx);
export const lineKey = (i) => i.productId + '|' + (i.variantId || '') + (i.free ? '|free' : '');
export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);
  useEffect(() => { try { setItems(JSON.parse(localStorage.getItem('tt_cart') || '[]')); } catch {} setReady(true); }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem('tt_cart', JSON.stringify(items)); } catch {} } }, [items, ready]);
  const add = (item, qty = 1) => setItems((cur) => {
    const k = lineKey(item), max = item.maxQty || 20, f = cur.find((i) => lineKey(i) === k);
    return f ? cur.map((i) => (lineKey(i) === k ? { ...i, qty: Math.min(i.qty + qty, max) } : i)) : [...cur, { ...item, qty: Math.min(qty, max) }];
  });
  const setQty = (k, q) => setItems((cur) => cur.map((i) => (lineKey(i) === k ? { ...i, qty: Math.max(1, Math.min(q, i.maxQty || 20)) } : i)));
  const remove = (k) => setItems((cur) => cur.filter((i) => lineKey(i) !== k));
  const clear = () => setItems([]);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.filter((i) => !i.free).reduce((s, i) => s + i.qty * i.price, 0);   // free toys cost nothing
  return <Ctx.Provider value={{ items, add, setQty, remove, clear, count, subtotal, ready }}>{children}</Ctx.Provider>;
}
