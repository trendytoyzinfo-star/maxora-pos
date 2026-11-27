// Date ranges in Indian time (IST) and a helper that reads every page of results (the database returns at most 1000 rows at a time).
export const istDay = (iso) => new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 10);
export const istToday = () => istDay(new Date().toISOString());
export function parseRange(sp) {
  const ok = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  let to = ok(sp.to) ? sp.to : istToday();
  let from = ok(sp.from) ? sp.from : new Date(Date.parse(to + 'T00:00:00Z') - 29 * 864e5).toISOString().slice(0, 10);
  if (from > to) [from, to] = [to, from];
  return { from, to, fromIso: `${from}T00:00:00+05:30`, toIso: `${to}T23:59:59.999+05:30` };
}
export async function fetchAll(build) {
  const out = [];
  for (let from = 0; out.length < 20000; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
