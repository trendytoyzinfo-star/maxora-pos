-- TrendyToyz: every price is a whole rupee (no paise). Run ONCE in Supabase -> SQL Editor (after 11). Safe to run again.
begin;

-- 1) whatever is typed or imported is rounded to the nearest rupee when it is saved
create or replace function public.round_product_prices() returns trigger language plpgsql as $f$
begin
  new.price := round(new.price); new.mrp := round(new.mrp); new.shipping_charge := round(new.shipping_charge);
  if jsonb_typeof(new.variants) = 'array' and jsonb_array_length(new.variants) > 0 then
    select jsonb_agg(t.e
             || case when jsonb_typeof(t.e->'price') in ('number','string') and t.e->>'price' <> '' then jsonb_build_object('price', round((t.e->>'price')::numeric)) else '{}'::jsonb end
             || case when jsonb_typeof(t.e->'mrp') in ('number','string') and t.e->>'mrp' <> '' then jsonb_build_object('mrp', round((t.e->>'mrp')::numeric)) else '{}'::jsonb end
           order by t.i)
      into new.variants from jsonb_array_elements(new.variants) with ordinality t(e, i);
  end if;
  return new;
end $f$;
drop trigger if exists round_prices on public.products;
create trigger round_prices before insert or update on public.products for each row execute function public.round_product_prices();

create or replace function public.round_coupon_amounts() returns trigger language plpgsql as $f$
begin
  if new.discount_type <> 'percent' then new.discount_value := round(new.discount_value); end if;
  new.min_order := round(new.min_order); new.max_discount := round(new.max_discount);
  return new;
end $f$;
drop trigger if exists round_amounts on public.coupons;
create trigger round_amounts before insert or update on public.coupons for each row execute function public.round_coupon_amounts();

-- 2) fix what is already saved (old orders and bills are NOT changed: they show what was really charged)
update public.products set price = price;
update public.coupons set min_order = min_order;
update public.store_settings set free_shipping_above = round(free_shipping_above) where free_shipping_above is not null;

-- 3) discounts and timed price changes also give whole rupees (same functions as before, only the rounding differs)
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
    return query select round(p_base), false, true;
    return;
  end if;
  v_delta := case r.mode when 'percent' then round(p_base * r.value / 100) else round(r.value) end;
  return query select (case when r.direction = 'increase' then round(p_base + v_delta) else greatest(round(p_base - v_delta), 1::numeric) end), true, r.allow_other_offers;
end $function$;

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
  v_rem int; v_auto jsonb := '[]'::jsonb; v_auto_val numeric := 0; v_auto_units int := 0; v_dtot numeric := 0; r record; stk int; used int; give int;
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
      v_pct := d.free_limit_pct; v_budget := round(tmp * d.free_limit_pct / 100);
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

  -- DEFAULT FREE TOYS: whatever free toys the customer did not choose, he gets the SAME toy he bought (free), as long as it is in stock.
  if v_did is not null and v_free_ok and v_allowed > v_free_units then
    v_rem := v_allowed - v_free_units;
    for r in
      select l.product_id, l.variant_id, l.category_id, l.unit_price, l.base_price, l.qty, l.ruled
        from jsonb_to_recordset(lines) as l(product_id uuid, variant_id text, category_id uuid, unit_price numeric, base_price numeric, qty int, ruled boolean, eligible boolean, is_free boolean)
       where l.eligible and not l.is_free and (v_scope = 'all' or (v_scope = 'category' and l.category_id = v_dcat) or (v_scope = 'product' and l.product_id = v_dprod))
       order by l.unit_price desc, l.product_id, l.variant_id
    loop
      exit when v_rem <= 0;
      select * into pr from products where id = r.product_id;
      if coalesce(r.variant_id, '') <> '' then
        select (e.value->>'stock')::int into stk from jsonb_array_elements(pr.variants) e where e.value->>'id' = r.variant_id limit 1;
      else
        stk := pr.stock;
      end if;
      select coalesce(sum(u.qty), 0) into used from (
        select a.qty, a.product_id, a.variant_id from jsonb_to_recordset(lines) as a(product_id uuid, variant_id text, qty int)
        union all
        select b.qty, b.product_id, b.variant_id from jsonb_to_recordset(v_auto) as b(product_id uuid, variant_id text, qty int)) u
       where u.product_id = r.product_id and coalesce(u.variant_id, '') = coalesce(r.variant_id, '');
      give := least(v_rem, r.qty, coalesce(stk, 0) - used);
      if give > 0 then
        v_auto := v_auto || jsonb_build_object('product_id', r.product_id, 'variant_id', coalesce(r.variant_id, ''), 'category_id', r.category_id, 'unit_price', r.unit_price, 'base_price', r.base_price, 'qty', give, 'ruled', r.ruled, 'eligible', true, 'is_free', true, 'auto', true);
        v_auto_val := v_auto_val + give * r.unit_price; v_rem := v_rem - give;
      end if;
    end loop;
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
      v_cdisc := case c.discount_type when 'percent' then round(elig * c.discount_value / 100) else round(c.discount_value) end;
      if c.max_discount is not null then v_cdisc := least(v_cdisc, c.max_discount); end if;
      v_cdisc := least(v_cdisc, elig);
      v_coupon_ok := true;
    end if;
  end if;

  -- only ONE offer per order: the one that saves the customer more. Free toys (chosen + default) win a tie.
  v_dtot := v_ddisc + v_auto_val;
  if v_coupon_ok and (v_dtot = 0 or v_cdisc > v_dtot) then
    v_kind := 'coupon'; v_disc := v_cdisc; v_label := 'Coupon ' || c.code; v_offer_code := c.code;
    if v_free_units > 0 and v_free_ok then
      v_free_ok := false; v_free_msg := 'Only one offer can be used per order. Coupon ' || c.code || ' saves you more, so the free toys were removed.';
    end if;
    if v_auto_val > 0 then
      v_auto := '[]'::jsonb; v_auto_val := 0;
      v_notice := 'Only one offer can be used per order. Coupon ' || c.code || ' saves you more than the free toys, so the free toys were not added.';
    end if;
  elsif v_dtot > 0 then
    v_kind := 'deal'; v_disc := v_dtot; v_label := v_dname || ' (free toys)';
    if v_auto_val > 0 then
      lines := lines || v_auto; sub := sub + v_auto_val;
      select coalesce(sum((e.value->>'qty')::int), 0) into v_auto_units from jsonb_array_elements(v_auto) e;
    end if;
    if v_coupon_ok then v_notice := 'Only one offer can be used per order. Your free toys save more than coupon ' || c.code || ', so the coupon was not used.'; end if;
  end if;
  if v_did is not null then
    v_claim := jsonb_build_object('deal_id', v_did, 'deal_name', v_dname, 'allowed', v_allowed, 'chosen', v_free_units, 'auto', v_auto_units, 'budget', v_budget, 'spent', v_free_charge, 'pct', v_pct, 'scope', v_scope, 'category_id', v_dcat, 'product_id', v_dprod);
  end if;

  return jsonb_build_object(
    'lines', lines, 'subtotal', sub, 'eligible_subtotal', elig, 'shipping', ship, 'discount', v_disc,
    'offer_kind', v_kind, 'offer_label', v_label, 'offer_code', v_offer_code, 'deal_id', v_did,
    'coupon_error', v_cerr, 'notice', v_notice, 'free_shipping_above', s.free_shipping_above,
    'paid_subtotal', paid_sub, 'free_ok', v_free_ok, 'free_msg', v_free_msg, 'claim', v_claim);
end $function$;

commit;
notify pgrst, 'reload schema';
