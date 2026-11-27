-- TrendyToyz: checkout upgrade. Run once in Supabase -> SQL Editor.
-- Safe to run again (create or replace).

-- 1) create_order: ONE shipping charge per order (the highest among the items),
--    and items are locked in a fixed order so two shoppers cannot deadlock.
create or replace function public.create_order(p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s store_settings%rowtype; c coupons%rowtype; o orders%rowtype; pr products%rowtype;
  it jsonb; v jsonb; vid text; idx int; qty int; price numeric; mrp numeric; stk int; img text;
  v_oid uuid := gen_random_uuid(); sub numeric := 0; ship numeric := 0; disc numeric := 0; method text := p->>'payment_method';
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
      price := coalesce((v->>'price')::numeric, pr.price); mrp := coalesce((v->>'mrp')::numeric, pr.mrp); stk := (v->>'stock')::int;
      if stk < qty then raise exception 'Only % left of % (%)', stk, pr.name, v->>'name'; end if;
      update products set variants = jsonb_set(variants, array[idx::text, 'stock'], to_jsonb(stk - qty)), updated_at = now() where id = pr.id;
    else
      price := pr.price; mrp := pr.mrp; stk := pr.stock;
      if stk < qty then raise exception 'Only % left of %', stk, pr.name; end if;
      update products set stock = stock - qty, updated_at = now() where id = pr.id;
    end if;
    select storage_path into img from product_images where product_id = pr.id order by sort_order limit 1;
    insert into order_items (order_id, product_id, variant_name, product_name, sku, image_path, unit_price, mrp, quantity, line_total)
    values (v_oid, pr.id, v->>'name', pr.name, coalesce(v->>'sku', pr.sku), img, price, mrp, qty, price * qty);
    sub := sub + price * qty; ship := greatest(ship, pr.shipping_charge);
  end loop;

  if s.free_shipping_above is not null and sub >= s.free_shipping_above then ship := 0; end if;
  if nullif(p->>'coupon_code','') is not null then
    select * into c from coupons where code = upper(trim(p->>'coupon_code')) and is_active for update;
    if not found or (c.expires_at is not null and c.expires_at < now()) or (c.usage_limit is not null and c.used_count >= c.usage_limit) or sub < c.min_order
      then raise exception 'Coupon is not valid for this order'; end if;
    disc := case c.discount_type when 'percent' then round(sub * c.discount_value / 100, 2) else c.discount_value end;
    if c.max_discount is not null then disc := least(disc, c.max_discount); end if;
    disc := least(disc, sub);
    update coupons set used_count = used_count + 1 where id = c.id;
  end if;

  update orders set subtotal = sub, shipping_total = ship, discount = disc, total = sub + ship - disc, coupon_code = c.code where id = v_oid returning * into o;
  insert into order_status_history (order_id, status, note) values (v_oid, 'placed', 'Order placed');
  return jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total', o.total, 'access_token', o.access_token, 'duplicate', false);
end $function$;

-- 2) Cancel an ONLINE order that was never paid: put stock and coupon use back.
create or replace function public.cancel_unpaid_order(p_order_id uuid, p_reason text default 'Payment not completed')
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare o orders%rowtype; it record; pr products%rowtype; idx int;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if o.payment_method <> 'online' or o.payment_status <> 'pending' or o.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'not_cancellable');
  end if;

  for it in select * from order_items where order_id = o.id and product_id is not null order by product_id loop
    select * into pr from products where id = it.product_id for update;
    if not found then continue; end if;
    if it.variant_name is not null then
      select (i - 1)::int into idx from jsonb_array_elements(pr.variants) with ordinality t(e, i) where e->>'name' = it.variant_name limit 1;
      if idx is not null then
        update products set variants = jsonb_set(variants, array[idx::text, 'stock'], to_jsonb(coalesce((variants->idx->>'stock')::int, 0) + it.quantity)), updated_at = now() where id = pr.id;
      end if;
    else
      update products set stock = stock + it.quantity, updated_at = now() where id = pr.id;
    end if;
  end loop;

  if o.coupon_code is not null then
    update coupons set used_count = greatest(used_count - 1, 0) where code = o.coupon_code;
  end if;
  update orders set status = 'cancelled', cancel_reason = p_reason, updated_at = now() where id = o.id;
  insert into order_status_history (order_id, status, note) values (o.id, 'cancelled', p_reason);
  return jsonb_build_object('ok', true);
end $function$;

-- 3) Cancel every online order that stayed unpaid for p_minutes.
create or replace function public.expire_unpaid_orders(p_minutes int default 60)
 returns int
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r record; n int := 0;
begin
  for r in select id from orders
    where payment_method = 'online' and payment_status = 'pending' and status <> 'cancelled'
      and created_at < now() - make_interval(mins => p_minutes)
  loop
    if (public.cancel_unpaid_order(r.id, 'Payment not completed in time')->>'ok')::boolean then n := n + 1; end if;
  end loop;
  return n;
end $function$;

-- Only the server (service_role) may call these. Shoppers must never.
revoke all on function public.create_order(jsonb) from public, anon, authenticated;
revoke all on function public.cancel_unpaid_order(uuid, text) from public, anon, authenticated;
revoke all on function public.expire_unpaid_orders(int) from public, anon, authenticated;
grant execute on function public.create_order(jsonb) to service_role;
grant execute on function public.cancel_unpaid_order(uuid, text) to service_role;
grant execute on function public.expire_unpaid_orders(int) to service_role;

-- 4) OPTIONAL but recommended: run the cleanup every 15 minutes.
--    First enable it: Supabase -> Database -> Extensions -> pg_cron -> Enable. Then run:
-- select cron.schedule('expire-unpaid-orders', '*/15 * * * *', $$select public.expire_unpaid_orders(60)$$);
