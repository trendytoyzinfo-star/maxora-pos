-- TrendyToyz v10: Buy X Get Y -> the customer CLAIMS and picks his free toys; cancel reasons; password reset.
-- Run ONCE in Supabase -> SQL Editor (after 06). Safe to run again.

-- How expensive a free toy may be: up to this % of what the customer paid for the toys that earned it (default 80).
-- The SAME toy he bought is always allowed.
alter table public.deals add column if not exists free_limit_pct int not null default 80;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'deals_free_limit_pct_chk') then
    alter table public.deals add constraint deals_free_limit_pct_chk check (free_limit_pct between 1 and 100);
  end if;
end $$;

-- ============ 8) ONE place that works out prices and the single best offer ============
-- Used by the store (to show the total) and by create_order (the final price). Read-only.
-- Only ONE offer is ever applied: the best of (the coupon the customer typed) and (the best buy-get-free deal).
create or replace function public.price_cart(p_items jsonb, p_coupon text, p_user uuid, p_phone text, p_exclude uuid default null)
 returns jsonb
 language plpgsql security definer set search_path to 'public' as $function$
declare
  s store_settings%rowtype; pr products%rowtype; c coupons%rowtype; d record; x record;
  it jsonb; v jsonb; vid text; qty int; base numeric; unit numeric; elig_line boolean;
  lines jsonb := '[]'::jsonb; sub numeric := 0; elig numeric := 0; ship numeric := 0;
  v_code text := upper(trim(coalesce(p_coupon, ''))); v_cerr text := null; v_cdisc numeric := 0; v_coupon_ok boolean := false;
  v_ddisc numeric := 0; v_dname text := null; v_did uuid := null;
  arr numeric[]; n int; k int; cd numeric;
  v_kind text := null; v_label text := null; v_disc numeric := 0; v_notice text := null; v_offer_code text := null;
  paid_sub numeric := 0; is_free boolean; g_cnt int; a int; tmp numeric;
  v_allowed int := 0; v_budget numeric := 0; v_pct int := 80; v_scope text; v_dcat uuid; v_dprod uuid;
  v_free_units int := 0; v_free_val numeric := 0; v_free_charge numeric := 0; v_out int := 0;
  v_free_ok boolean := true; v_free_msg text := null; v_claim jsonb := null;
begin
  select * into s from store_settings where id = 1;
  for it in select e.value from jsonb_array_elements(p_items) e order by e.value->>'product_id', e.value->>'variant_id' loop
    qty := (it->>'quantity')::int;
    select * into pr from products where id = (it->>'product_id')::uuid and status = 'active';
    if not found or qty is null or qty < 1 then continue; end if;
    vid := coalesce(it->>'variant_id', ''); v := null;
    is_free := coalesce((it->>'free')::boolean, false);
    if vid <> '' then
      select e.value into v from jsonb_array_elements(pr.variants) e where e.value->>'id' = vid and coalesce((e.value->>'is_active')::boolean, true) limit 1;
      if v is null then continue; end if;
      base := coalesce((v->>'price')::numeric, pr.price);
    else
      base := pr.price;
    end if;
    select * into x from public.rule_price(base, pr.id, pr.category_id);
    unit := x.price;
    elig_line := (not x.ruled) or x.allow_other;
    lines := lines || jsonb_build_object('product_id', pr.id, 'variant_id', vid, 'category_id', pr.category_id, 'unit_price', unit, 'base_price', base, 'qty', qty, 'ruled', x.ruled, 'eligible', elig_line, 'is_free', is_free);
    sub := sub + unit * qty;
    if not is_free then
      paid_sub := paid_sub + unit * qty;
      if elig_line then elig := elig + unit * qty; end if;
    end if;
    ship := greatest(ship, pr.shipping_charge);
  end loop;
  if s.free_shipping_above is not null and paid_sub >= s.free_shipping_above then ship := 0; end if;

  -- Buy X Get Y: which deal does the customer qualify for (by the toys he PAYS for), and what may he pick free?
  for d in select * from deals where is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()) order by created_at loop
    select array_agg(l.unit_price order by l.unit_price) into arr
      from jsonb_to_recordset(lines) as l(product_id uuid, category_id uuid, unit_price numeric, qty int, eligible boolean, is_free boolean)
      cross join lateral generate_series(1, l.qty) g
     where l.eligible and not l.is_free and (d.scope = 'all' or (d.scope = 'category' and l.category_id = d.category_id) or (d.scope = 'product' and l.product_id = d.product_id));
    n := coalesce(array_length(arr, 1), 0);
    g_cnt := n / d.buy_qty;
    a := g_cnt * d.free_qty;
    if a > v_allowed then
      select coalesce(sum(u.val), 0) into tmp from unnest(arr[1:(g_cnt * d.buy_qty)]) as u(val);   -- value of the toys that earned the free ones (cheapest first)
      v_allowed := a; v_did := d.id; v_dname := d.name; v_scope := d.scope; v_dcat := d.category_id; v_dprod := d.product_id;
      v_pct := d.free_limit_pct; v_budget := round(tmp * d.free_limit_pct / 100, 2);
    end if;
  end loop;

  -- the free toys the customer picked: allowed count, inside the deal's toys, and worth at most the limit (the SAME toy he bought is always allowed)
  select coalesce(sum(l.qty), 0), coalesce(sum(l.qty * l.unit_price), 0) into v_free_units, v_free_val
    from jsonb_to_recordset(lines) as l(product_id uuid, category_id uuid, unit_price numeric, qty int, eligible boolean, is_free boolean) where l.is_free;
  if v_free_units > 0 then
    if v_did is null then
      v_free_ok := false; v_free_msg := 'Free toys need a qualifying purchase first. Please choose your free toys again.';
    else
      select coalesce(sum(l.qty), 0) into v_out
        from jsonb_to_recordset(lines) as l(product_id uuid, category_id uuid, unit_price numeric, qty int, eligible boolean, is_free boolean)
       where l.is_free and not (v_scope = 'all' or (v_scope = 'category' and l.category_id = v_dcat) or (v_scope = 'product' and l.product_id = v_dprod));
      select coalesce(sum(l.qty * l.unit_price), 0) into v_free_charge
        from jsonb_to_recordset(lines) as l(product_id uuid, category_id uuid, unit_price numeric, qty int, eligible boolean, is_free boolean)
       where l.is_free and not exists (select 1 from jsonb_to_recordset(lines) as b(product_id uuid, is_free boolean) where not b.is_free and b.product_id = l.product_id);
      if v_free_units > v_allowed or v_out > 0 or v_free_charge > v_budget + 0.005 then
        v_free_ok := false; v_free_msg := 'Your free toy choice is no longer valid for this cart. Please choose your free toys again.';
      else
        v_ddisc := v_free_val;
      end if;
    end if;
  end if;
  if v_did is not null then
    v_claim := jsonb_build_object('deal_id', v_did, 'deal_name', v_dname, 'allowed', v_allowed, 'chosen', v_free_units, 'budget', v_budget, 'spent', v_free_charge, 'pct', v_pct, 'scope', v_scope, 'category_id', v_dcat, 'product_id', v_dprod);
  end if;

  -- the coupon the customer typed
  if v_code <> '' then
    select * into c from coupons where coupons.code = v_code and coupons.is_active;
    if not found or (c.expires_at is not null and c.expires_at < now()) or (c.usage_limit is not null and c.used_count >= c.usage_limit) then
      v_cerr := 'This coupon is not valid.';
    elsif paid_sub < coalesce(c.min_order, 0) then
      v_cerr := 'This coupon needs a minimum order of ₹' || (coalesce(c.min_order, 0))::bigint::text || '.';
    elsif c.first_order_only and p_user is null then
      v_cerr := 'Please log in to use this coupon.';
    elsif c.first_order_only and exists (
      select 1 from orders o
       where o.status <> 'cancelled' and (o.payment_method = 'cod' or o.payment_status = 'paid')
         and o.id is distinct from p_exclude
         and (o.user_id = p_user or (p_phone is not null and p_phone <> '' and o.customer_phone = p_phone))) then
      v_cerr := 'This coupon is only for your first order.';
    elsif elig <= 0 then
      v_cerr := 'This coupon does not apply to the items in your cart.';
    else
      v_cdisc := case c.discount_type when 'percent' then round(elig * c.discount_value / 100, 2) else c.discount_value end;
      if c.max_discount is not null then v_cdisc := least(v_cdisc, c.max_discount); end if;
      v_cdisc := least(v_cdisc, elig);
      v_coupon_ok := true;
    end if;
  end if;

  -- only ONE offer per order: the one that saves the customer more. Free toys that were picked win a tie.
  if v_coupon_ok and (v_ddisc = 0 or v_cdisc > v_ddisc) then
    v_kind := 'coupon'; v_disc := v_cdisc; v_label := 'Coupon ' || c.code; v_offer_code := c.code;
    if v_free_units > 0 and v_free_ok then
      v_free_ok := false; v_free_msg := 'Only one offer can be used per order. Coupon ' || c.code || ' saves you more, so the free toys were removed.';
    end if;
  elsif v_ddisc > 0 then
    v_kind := 'deal'; v_disc := v_ddisc; v_label := v_dname || ' (free toys)';
    if v_coupon_ok then v_notice := 'Only one offer can be used per order. Your free toys save more than coupon ' || c.code || ', so the coupon was not used.'; end if;
  end if;

  return jsonb_build_object(
    'lines', lines, 'subtotal', sub, 'eligible_subtotal', elig, 'shipping', ship, 'discount', v_disc,
    'offer_kind', v_kind, 'offer_label', v_label, 'offer_code', v_offer_code, 'deal_id', v_did,
    'coupon_error', v_cerr, 'notice', v_notice, 'free_shipping_above', s.free_shipping_above,
    'paid_subtotal', paid_sub, 'free_ok', v_free_ok, 'free_msg', v_free_msg, 'claim', v_claim);
end $function$;
revoke all on function public.rule_price(numeric, uuid, uuid) from public, anon, authenticated;
revoke all on function public.price_cart(jsonb, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.rule_price(numeric, uuid, uuid) to service_role;
grant execute on function public.price_cart(jsonb, text, uuid, text, uuid) to service_role;

-- ============ 9) create_order: now uses the timed prices and the single best offer ============
-- (Same as before: one shipping charge per order, stock is locked, coupon use is counted.)
create or replace function public.create_order(p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s store_settings%rowtype; c coupons%rowtype; o orders%rowtype; pr products%rowtype; x record; pc jsonb;
  it jsonb; v jsonb; vid text; idx int; qty int; v_price numeric; v_mrp numeric; stk int; img text;
  v_oid uuid := gen_random_uuid(); sub numeric := 0; ship numeric := 0; disc numeric := 0; method text := p->>'payment_method';
  v_coupon text := null; v_kind text := null; v_label text := null;
begin
  select * into o from orders where idempotency_key = p->>'idempotency_key';
  if found then return jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total', o.total, 'access_token', o.access_token, 'duplicate', true); end if;
  if method not in ('cod','online') then raise exception 'Invalid payment method'; end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then raise exception 'Cart is empty'; end if;
  select * into s from store_settings where id = 1;
  if method = 'cod' and not s.cod_enabled then raise exception 'Cash on delivery is not available'; end if;

  insert into orders (id, user_id, payment_method, customer_name, customer_email, customer_phone, shipping_address, idempotency_key)
  values (v_oid, nullif(p->>'user_id','')::uuid, method, p->>'customer_name', p->>'customer_email', p->>'customer_phone', p->'shipping_address', p->>'idempotency_key');

  for it in select e.value from jsonb_array_elements(p->'items') e order by e.value->>'product_id', e.value->>'variant_id' loop
    qty := (it->>'quantity')::int;
    if qty is null or qty < 1 or qty > 20 then raise exception 'Invalid quantity'; end if;
    select * into pr from products where id = (it->>'product_id')::uuid and status = 'active' for update;
    if not found then raise exception 'A product in your cart is no longer available'; end if;
    if method = 'cod' and not pr.cod_enabled then raise exception '% is not available for cash on delivery', pr.name; end if;
    vid := it->>'variant_id'; v := null; idx := null;
    if vid is not null and vid <> '' then
      select e, (i - 1)::int into v, idx from jsonb_array_elements(pr.variants) with ordinality t(e, i) where e->>'id' = vid and coalesce((e->>'is_active')::boolean, true);
      if v is null then raise exception 'Selected option is not available'; end if;
      v_price := coalesce((v->>'price')::numeric, pr.price); v_mrp := coalesce((v->>'mrp')::numeric, pr.mrp); stk := (v->>'stock')::int;
      if stk < qty then raise exception 'Only % left of % (%)', stk, pr.name, v->>'name'; end if;
      update products set variants = jsonb_set(variants, array[idx::text, 'stock'], to_jsonb(stk - qty)), updated_at = now() where id = pr.id;
    else
      v_price := pr.price; v_mrp := pr.mrp; stk := pr.stock;
      if stk < qty then raise exception 'Only % left of %', stk, pr.name; end if;
      update products set stock = stock - qty, updated_at = now() where id = pr.id;
    end if;
    select * into x from public.rule_price(v_price, pr.id, pr.category_id);   -- timed price change, if one is running
    v_price := x.price;
    select storage_path into img from product_images where product_id = pr.id order by sort_order limit 1;
    insert into order_items (order_id, product_id, variant_name, product_name, sku, image_path, unit_price, mrp, quantity, line_total)
    values (v_oid, pr.id, v->>'name', pr.name, coalesce(v->>'sku', pr.sku), img, v_price, v_mrp, qty, v_price * qty);
    sub := sub + v_price * qty; ship := greatest(ship, pr.shipping_charge);
  end loop;

  -- the single best offer (coupon or free toys), worked out by the same function the store uses
  pc := public.price_cart(p->'items', p->>'coupon_code', nullif(p->>'user_id','')::uuid, p->>'customer_phone', v_oid);
  if pc->>'coupon_error' is not null then raise exception '%', pc->>'coupon_error'; end if;
  if coalesce((pc->>'free_ok')::boolean, true) is not true then raise exception '%', coalesce(pc->>'free_msg', 'Your free toy choice is not valid. Please choose again.'); end if;
  ship := coalesce((pc->>'shipping')::numeric, ship);   -- one shipping charge; free above the limit counts only the toys he pays for
  disc := coalesce((pc->>'discount')::numeric, 0);
  v_kind := pc->>'offer_kind'; v_label := pc->>'offer_label';
  if v_kind = 'coupon' then
    select * into c from coupons where code = pc->>'offer_code' for update;
    if not found or (c.usage_limit is not null and c.used_count >= c.usage_limit) then raise exception 'Coupon is not valid for this order'; end if;
    update coupons set used_count = used_count + 1 where id = c.id;
    v_coupon := c.code;
  end if;
  disc := least(disc, sub);

  update orders set subtotal = sub, shipping_total = ship, discount = disc, total = sub + ship - disc, coupon_code = v_coupon, offer_kind = v_kind, offer_label = v_label where id = v_oid returning * into o;
  insert into order_status_history (order_id, status, note) values (v_oid, 'placed', 'Order placed');
  return jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total', o.total, 'access_token', o.access_token, 'duplicate', false);
end $function$;
revoke all on function public.create_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb) to service_role;


notify pgrst, 'reload schema';
