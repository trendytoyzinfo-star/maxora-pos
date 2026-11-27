// SERVER ONLY. What the admin has not looked at yet: new real orders (COD, or paid online) and new return requests.
export const REAL_ORDER = 'payment_method.eq.cod,payment_status.eq.paid';
export async function adminCounts(db) {
  try {
    const [o, r] = await Promise.all([
      db.from('orders').select('id', { count: 'exact', head: true }).is('seen_at', null).neq('status', 'cancelled').or(REAL_ORDER),
      db.from('return_claims').select('id', { count: 'exact', head: true }).is('seen_at', null),
    ]);
    return { orders: o.count || 0, returns: r.count || 0 };
  } catch { return { orders: 0, returns: 0 }; }
}
