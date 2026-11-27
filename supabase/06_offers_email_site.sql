-- TrendyToyz v9: offers, timed price changes, site settings, refund tracking.
-- Run ONCE in Supabase -> SQL Editor BEFORE deploying v9. Safe to run again.
-- If it shows an error, send me a screenshot of the red message.

-- ============ 1) Coupons: "first order only" ============
alter table public.coupons add column if not exists first_order_only boolean not null default false;

-- ============ 2) Buy X Get Y Free deals (automatic, no code) ============
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  buy_qty int not null check (buy_qty >= 1 and buy_qty <= 20),
  free_qty int not null check (free_qty >= 1 and free_qty <= 20),
  scope text not null default 'all' check (scope in ('all', 'category', 'product')),
  category_id uuid references public.categories(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  is_active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.deals enable row level security;       -- no policies: only the server key can use it
revoke all on public.deals from anon, authenticated;
grant all on public.deals to service_role;

-- ============ 3) Timed price changes (increase / decrease for some time) ============
create table if not exists public.price_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null default 'product' check (scope in ('all', 'category', 'product')),
  category_id uuid references public.categories(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  direction text not null check (direction in ('increase', 'decrease')),
  mode text not null check (mode in ('percent', 'amount')),
  value numeric not null check (value > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default false,
  allow_other_offers boolean not null default false,   -- false = coupons / buy-get-free do not apply to these items while the price change is running
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.price_rules enable row level security;
drop policy if exists "price rules are public" on public.price_rules;
create policy "price rules are public" on public.price_rules for select to anon, authenticated using (is_active);
grant select on public.price_rules to anon, authenticated;
grant all on public.price_rules to service_role;

-- ============ 4) Orders remember which offer was used ============
alter table public.orders add column if not exists offer_label text;
alter table public.orders add column if not exists offer_kind text;
alter table public.orders add column if not exists confirmation_emailed_at timestamptz;

-- ============ 5) Site settings (announcement bar, favicon, store info) ============
alter table public.store_settings add column if not exists announcement_text text;
alter table public.store_settings add column if not exists announcement_link text;
alter table public.store_settings add column if not exists announcement_active boolean not null default false;
alter table public.store_settings add column if not exists favicon_path text;
alter table public.store_settings add column if not exists store_info jsonb not null default '{}'::jsonb;

-- ============ 6) Refund tracking (so one refund can never be sent twice) ============
alter table public.payment_issues add column if not exists refund_id text;
alter table public.payment_issues add column if not exists refund_state text;
alter table public.return_claims add column if not exists refund_id text;
alter table public.return_claims add column if not exists refund_state text;

-- ============ 7) Price after a timed price change ============
create or replace function public.rule_price(p_base numeric, p_prod uuid, p_cat uuid)
 returns table(price numeric, ruled boolean, allow_other boolean)
 language plpgsql security definer set search_path to 'public' as $function$
declare r price_rules%rowtype; v_delta numeric;
begin
  select * into r from price_rules
   where is_active and now() >= starts_at and now() <= ends_at
     and (scope = 'all' or (scope = 'category' and category_id = p_cat) or (scope = 'product' and product_id = p_prod))
   order by case scope when 'product' then 0 when 'category' then 1 else 2 end, created_at desc
   limit 1;
  if not found then
    return query select p_base, false, true;
    return;
  end if;
  v_delta := case r.mode when 'percent' then round(p_base * r.value / 100, 2) else r.value end;
  return query select (case when r.direction = 'increase' then round(p_base + v_delta, 2) else greatest(round(p_base - v_delta, 2), 1::numeric) end), true, r.allow_other_offers;
end $function$;

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
begin
  select * into s from store_settings where id = 1;
  for it in select e.value from jsonb_array_elements(p_items) e order by e.value->>'product_id', e.value->>'variant_id' loop
    qty := (it->>'quantity')::int;
    select * into pr from products where id = (it->>'product_id')::uuid and status = 'active';
    if not found or qty is null or qty < 1 then continue; end if;
    vid := coalesce(it->>'variant_id', ''); v := null;
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
    lines := lines || jsonb_build_object('product_id', pr.id, 'variant_id', vid, 'category_id', pr.category_id, 'unit_price', unit, 'base_price', base, 'qty', qty, 'ruled', x.ruled, 'eligible', elig_line);
    sub := sub + unit * qty;
    if elig_line then elig := elig + unit * qty; end if;
    ship := greatest(ship, pr.shipping_charge);
  end loop;
  if s.free_shipping_above is not null and sub >= s.free_shipping_above then ship := 0; end if;

  -- best buy-get-free deal (cheapest items become free)
  for d in select * from deals where is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()) loop
    select array_agg(l.unit_price order by l.unit_price) into arr
      from jsonb_to_recordset(lines) as l(product_id uuid, category_id uuid, unit_price numeric, qty int, eligible boolean)
      cross join lateral generate_series(1, l.qty) g
     where l.eligible and (d.scope = 'all' or (d.scope = 'category' and l.category_id = d.category_id) or (d.scope = 'product' and l.product_id = d.product_id));
    n := coalesce(array_length(arr, 1), 0);
    k := (n / (d.buy_qty + d.free_qty)) * d.free_qty;
    cd := 0;
    if k > 0 then select coalesce(sum(a), 0) into cd from unnest(arr[1:k]) a; end if;
    if cd > v_ddisc then v_ddisc := cd; v_dname := d.name; v_did := d.id; end if;
  end loop;

  -- the coupon the customer typed
  if v_code <> '' then
    select * into c from coupons where coupons.code = v_code and coupons.is_active;
    if not found or (c.expires_at is not null and c.expires_at < now()) or (c.usage_limit is not null and c.used_count >= c.usage_limit) then
      v_cerr := 'This coupon is not valid.';
    elsif sub < coalesce(c.min_order, 0) then
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

  -- only ONE offer per order: the one that saves the customer more (a tie goes to the coupon)
  if v_coupon_ok and v_cdisc >= v_ddisc then
    v_kind := 'coupon'; v_disc := v_cdisc; v_label := 'Coupon ' || c.code; v_offer_code := c.code;
    if v_ddisc > 0 then v_notice := 'Only one offer can be used per order. Coupon ' || c.code || ' was applied instead of "' || v_dname || '".'; end if;
  elsif v_ddisc > 0 then
    v_kind := 'deal'; v_disc := v_ddisc; v_label := v_dname;
    if v_coupon_ok then v_notice := 'Only one offer can be used per order. "' || v_dname || '" saves you more, so it was applied instead of coupon ' || c.code || '.'; end if;
  end if;

  return jsonb_build_object(
    'lines', lines, 'subtotal', sub, 'eligible_subtotal', elig, 'shipping', ship, 'discount', v_disc,
    'offer_kind', v_kind, 'offer_label', v_label, 'offer_code', v_offer_code, 'deal_id', v_did,
    'coupon_error', v_cerr, 'notice', v_notice, 'free_shipping_above', s.free_shipping_above);
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

  if s.free_shipping_above is not null and sub >= s.free_shipping_above then ship := 0; end if;

  -- the single best offer (coupon or buy-get-free), worked out by the same function the store uses
  pc := public.price_cart(p->'items', p->>'coupon_code', nullif(p->>'user_id','')::uuid, p->>'customer_phone', v_oid);
  if pc->>'coupon_error' is not null then raise exception '%', pc->>'coupon_error'; end if;
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

-- ============ 10) Offers ready to use ============
-- TRENDY40: 40% off, first order of an account only. LIVE.
insert into public.coupons (code, description, discount_type, discount_value, min_order, is_active, first_order_only)
select 'TRENDY40', '40% off on your first order', 'percent', 40, 0, true, true
where not exists (select 1 from public.coupons where code = 'TRENDY40');
update public.coupons set discount_type = 'percent', discount_value = 40, first_order_only = true, is_active = true, description = '40% off on your first order' where code = 'TRENDY40';

-- Buy-get-free deals: created but OFF. Turn them on in Admin -> Offers when you want.
insert into public.deals (name, buy_qty, free_qty, scope, is_active)
select v.name, v.b, v.f, 'all', false
from (values ('Buy 1 Get 1 Free', 1, 1), ('Buy 2 Get 1 Free', 2, 1), ('Buy 3 Get 1 Free', 3, 1)) as v(name, b, f)
where not exists (select 1 from public.deals);

-- Tell Supabase to pick up the new functions right away.
notify pgrst, 'reload schema';
