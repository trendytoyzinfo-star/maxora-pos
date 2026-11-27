-- TrendyToyz admin upgrade. Run once in Supabase -> SQL Editor. Safe to run again.

-- 1) Couriers (dropdown in the admin). {AWB} in the link is replaced by the tracking number.
create table if not exists public.couriers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tracking_url_template text,
  is_active boolean not null default true,
  sort_order int not null default 0
);
alter table public.couriers enable row level security;   -- no policies: only the server key can use it
revoke all on public.couriers from anon, authenticated;
insert into public.couriers (name, tracking_url_template, sort_order) values
  ('DTDC', 'https://www.dtdc.in/tracking.asp?awb={AWB}', 1),
  ('Maruti Courier', null, 2),
  ('Xpressbees', 'https://www.xpressbees.com/shipment/tracking?awbNo={AWB}', 3),
  ('Delhivery', 'https://www.delhivery.com/track/package/{AWB}', 4),
  ('Fast Track', null, 5),
  ('Shadowfax', 'https://tracker.shadowfax.in/#/track/{AWB}', 6),
  ('India Post', 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx', 7),
  ('Blue Dart', 'https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo={AWB}', 8),
  ('Ecom Express', 'https://ecomexpress.in/tracking/?awb_field={AWB}', 9),
  ('Amazon Shipping', 'https://track.amazon.in/tracking/{AWB}', 10),
  ('Other', null, 11)
on conflict (name) do nothing;

-- 2) When an order was shipped / delivered (for reports)
alter table public.orders add column if not exists shipped_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;

-- 3) Cancel any order that is not shipped yet: stock and coupon come back.
--    If it was already paid online, it is added to "Payment issues" so you remember to refund it.
create or replace function public.cancel_order_admin(p_order_id uuid, p_reason text default 'Cancelled by store')
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare o orders%rowtype; it record; pr products%rowtype; idx int; refund boolean;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if o.status in ('cancelled', 'shipped', 'delivered') then return jsonb_build_object('ok', false, 'reason', 'not_cancellable'); end if;
  for it in select * from order_items where order_id = o.id and product_id is not null order by product_id loop
    select * into pr from products where id = it.product_id for update;
    if not found then continue; end if;
    if it.variant_name is not null then
      idx := null;
      select (i - 1)::int into idx from jsonb_array_elements(pr.variants) with ordinality t(e, i) where e->>'name' = it.variant_name limit 1;
      if idx is not null then
        update products set variants = jsonb_set(variants, array[idx::text, 'stock'], to_jsonb(coalesce((variants->idx->>'stock')::int, 0) + it.quantity)), updated_at = now() where id = pr.id;
      end if;
    else
      update products set stock = stock + it.quantity, updated_at = now() where id = pr.id;
    end if;
  end loop;
  if o.coupon_code is not null then update coupons set used_count = greatest(used_count - 1, 0) where code = o.coupon_code; end if;
  update orders set status = 'cancelled', cancel_reason = p_reason, updated_at = now() where id = o.id;
  insert into order_status_history (order_id, status, note) values (o.id, 'cancelled', p_reason);
  refund := (o.payment_method = 'online' and o.payment_status = 'paid' and o.razorpay_payment_id is not null);
  if refund then
    insert into payment_issues (order_id, razorpay_payment_id, amount_paise, reason, detail)
    values (o.id, o.razorpay_payment_id, round(o.total * 100), 'refund_due', 'Order cancelled by store. Refund the customer in Razorpay.')
    on conflict (razorpay_payment_id) do nothing;
  end if;
  return jsonb_build_object('ok', true, 'refund_due', refund);
end $function$;
revoke all on function public.cancel_order_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_order_admin(uuid, text) to service_role;
grant all on public.couriers to service_role;
