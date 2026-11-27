import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import Flash from '@/components/Flash';
import { toggleCoupon, createCoupon, deleteCoupon, createDeal, toggleDeal, deleteDeal, createPriceRule, togglePriceRule, deletePriceRule } from '../actions';

const dt = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—');
const small = { minHeight: 36, padding: '0 14px' };
const Toggle = ({ action, id, on, onLabel = 'Live → turn off', offLabel = 'Off → turn on' }) => (
  <form action={action}><input type="hidden" name="id" value={id} /><input type="hidden" name="on" value={on ? '0' : '1'} />
    <button className="btn ghost" style={small} type="submit">{on ? onLabel : offLabel}</button></form>
);
const Del = ({ action, id }) => <form action={action}><input type="hidden" name="id" value={id} /><button className="link" type="submit">Delete</button></form>;
const Scope = ({ cats, prods }) => (<>
  <label>Applies to<select name="scope" defaultValue="all"><option value="all">All toys</option><option value="category">One category</option><option value="product">One toy</option></select></label>
  <div className="two"><label>Category (if “One category”)<select name="category_id" defaultValue=""><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Toy (if “One toy”)<select name="product_id" defaultValue=""><option value="">—</option>{prods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
</>);
const where = (r, cats, prods) => (r.scope === 'all' ? 'All toys' : r.scope === 'category' ? `Category: ${cats.find((c) => c.id === r.category_id)?.name || '?'}` : `Toy: ${prods.find((p) => p.id === r.product_id)?.name || '?'}`);

export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams; const db = admin();
  const [{ data: rows }, { data: deals, error: dErr }, { data: rules }, { data: cats }, { data: prods }] = await Promise.all([
    db.from('coupons').select('*').order('created_at', { ascending: false }),
    db.from('deals').select('*').order('created_at', { ascending: false }),
    db.from('price_rules').select('*').order('created_at', { ascending: false }),
    db.from('categories').select('id,name').order('sort_order'),
    db.from('products').select('id,name').eq('status', 'active').order('name').limit(500),
  ]);
  const C = cats || [], P = prods || [];
  return (
    <div><h1>Offers</h1><Flash sp={sp} />
      <div className="box"><b>One offer per order.</b> If a customer qualifies for a coupon and also a Buy-get-free deal, the one that saves them more is used. They never stack. Timed price changes (below) change the toy's price itself; while one is running, coupons and deals do not apply to that toy unless you tick the box.</div>
      {dErr && <div className="bad">Could not load deals and price changes. Run 06_offers_email_site.sql in Supabase first.</div>}

      <h2>1. Coupons (customer types a code)</h2>
      <form action={createCoupon} className="box adm-form"><h3>Create a coupon</h3>
        <div className="two"><label>Offer code (customer types this)<input name="code" required maxLength={30} placeholder="DIWALI10" /></label>
          <label>Type<select name="discount_type" defaultValue="percent"><option value="percent">Percent off (%)</option><option value="flat">Flat amount off (₹)</option></select></label></div>
        <div className="two"><label>Discount value<input name="discount_value" type="number" min="1" step="1" required placeholder="10" /></label>
          <label>Maximum discount ₹ (optional, for % offers)<input name="max_discount" type="number" min="1" step="1" /></label></div>
        <div className="two"><label>Minimum order ₹ (optional)<input name="min_order" type="number" min="0" step="1" /></label>
          <label>Total uses allowed (optional)<input name="usage_limit" type="number" min="1" step="1" /></label>
          <label>Last day (optional)<input name="expires_on" type="date" /></label></div>
        <label className="chk"><input type="checkbox" name="first_order_only" /> Only for a customer's first order (one use per account)</label>
        <label>Note for yourself (optional)<input name="description" maxLength={120} /></label>
        <button className="btn" type="submit">Create coupon</button></form>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Used</th><th>Expires</th><th>On / off</th><th></th></tr></thead><tbody>
        {(rows || []).map((c) => <tr key={c.id}><td><b>{c.code}</b>{c.first_order_only && <div className="muted">First order only</div>}{c.description && <div className="muted">{c.description}</div>}</td><td>{c.discount_type === 'percent' ? `${Number(c.discount_value)}%` : `₹${Number(c.discount_value)}`}{c.max_discount ? ` (max ₹${Number(c.max_discount)})` : ''}</td>
          <td>₹{Number(c.min_order || 0)}</td><td>{c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ''}</td><td>{c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}</td>
          <td><Toggle action={toggleCoupon} id={c.id} on={c.is_active} onLabel="On → turn off" /></td><td><Del action={deleteCoupon} id={c.id} /></td></tr>)}
        {!rows?.length && <tr><td colSpan={7} className="muted">No coupons yet.</td></tr>}
      </tbody></table></div>

      <h2 id="deals">2. Buy X Get Y Free (automatic, no code)</h2>
      <p className="muted">You decide how many the customer buys and how many he gets free. In his cart he presses <b>Claim</b> and picks his free toys himself. Example: Buy 2 Get 2 Free, he pays for 2 toys and chooses 2 free ones. The <b>free toy price limit</b> keeps it fair: the free toys can be worth up to that % of what he paid for (500 paid, limit 80% → other free toys up to ₹400 in total). The <b>same toy he bought</b> is always free to pick, at any price. New deals start OFF.</p>
      <form action={createDeal} className="box adm-form"><h3>Create a deal</h3>
        <div className="two"><label>Customer buys (quantity)<input name="buy_qty" type="number" min="1" max="20" step="1" required defaultValue="1" /></label>
          <label>And gets free (quantity)<input name="free_qty" type="number" min="1" max="20" step="1" required defaultValue="1" /></label></div>
        <label>Free toy price limit (% of what he paid for)<input name="free_limit_pct" type="number" min="1" max="100" step="1" required defaultValue="80" /></label>
        <Scope cats={C} prods={P} />
        <div className="two"><label>Starts (optional)<input name="starts_at" type="datetime-local" /></label><label>Ends (optional)<input name="ends_at" type="datetime-local" /></label></div>
        <label>Name (optional, shown to customer)<input name="name" maxLength={60} placeholder="Buy 2 Get 1 Free" /></label>
        <button className="btn" type="submit">Create deal (OFF)</button></form>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Deal</th><th>Rule</th><th>Applies to</th><th>Time</th><th>Status</th><th></th></tr></thead><tbody>
        {(deals || []).map((d) => <tr key={d.id}><td><b>{d.name}</b></td><td>Buy {d.buy_qty}, get {d.free_qty} free<div className="muted">Free toys up to {d.free_limit_pct ?? 80}% of price paid</div></td><td>{where(d, C, P)}</td><td>{dt(d.starts_at)} → {dt(d.ends_at)}</td>
          <td><Toggle action={toggleDeal} id={d.id} on={d.is_active} /></td><td><Del action={deleteDeal} id={d.id} /></td></tr>)}
        {!deals?.length && <tr><td colSpan={6} className="muted">No deals yet.</td></tr>}
      </tbody></table></div>

      <h2 id="prices">3. Timed price change (raise or lower prices for some time)</h2>
      <p className="muted">Choose a toy, a category or all toys, how much to raise or lower the price (₹ or %), and the start and end time (India time). When the end time comes, prices go back to normal on their own. Pages can take up to 5 minutes to show a change; the checkout is always exact. New ones start OFF.</p>
      <form action={createPriceRule} className="box adm-form"><h3>Create a price change</h3>
        <div className="two"><label>Change<select name="direction" defaultValue="decrease"><option value="decrease">Lower the price (sale)</option><option value="increase">Raise the price</option></select></label>
          <label>By<select name="mode" defaultValue="percent"><option value="percent">Percent (%)</option><option value="amount">Amount (₹)</option></select></label>
          <label>How much<input name="value" type="number" min="1" step="0.01" required placeholder="20" /></label></div>
        <Scope cats={C} prods={P} />
        <div className="two"><label>Starts *<input name="starts_at" type="datetime-local" required /></label><label>Ends *<input name="ends_at" type="datetime-local" required /></label></div>
        <label>Name (optional)<input name="name" maxLength={60} placeholder="Weekend sale" /></label>
        <label className="chk"><input type="checkbox" name="allow_other_offers" /> Still allow coupons / Buy-get-free on these toys while this runs</label>
        <button className="btn" type="submit">Create price change (OFF)</button></form>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>Change</th><th>Applies to</th><th>Time</th><th>Status</th><th></th></tr></thead><tbody>
        {(rules || []).map((r) => { const now = Date.now(), live = r.is_active && new Date(r.starts_at) <= now && new Date(r.ends_at) >= now; return (
          <tr key={r.id}><td><b>{r.name}</b>{r.allow_other_offers && <div className="muted">Coupons allowed</div>}</td><td>{r.direction === 'increase' ? '+' : '−'}{r.mode === 'percent' ? `${Number(r.value)}%` : `₹${Number(r.value)}`}</td><td>{where(r, C, P)}</td><td>{dt(r.starts_at)} → {dt(r.ends_at)}</td>
            <td><Toggle action={togglePriceRule} id={r.id} on={r.is_active} />{r.is_active && <div className="muted">{live ? 'Running now' : new Date(r.ends_at) < now ? 'Ended' : 'Waiting for start time'}</div>}</td><td><Del action={deletePriceRule} id={r.id} /></td></tr>); })}
        {!rules?.length && <tr><td colSpan={6} className="muted">No price changes yet.</td></tr>}
      </tbody></table></div>
    </div>
  );
}
