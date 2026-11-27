-- TrendyToyz v12: "unseen" counters in the admin menu (new orders, new return requests).
-- Run ONCE in Supabase -> SQL Editor. Safe to run again (old orders/returns are marked seen only the first time).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'seen_at') then
    alter table public.orders add column seen_at timestamptz;
    update public.orders set seen_at = now();
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'return_claims' and column_name = 'seen_at') then
    alter table public.return_claims add column seen_at timestamptz;
    update public.return_claims set seen_at = now();
  end if;
end $$;
create index if not exists orders_unseen_idx on public.orders (created_at) where seen_at is null;
create index if not exists return_claims_unseen_idx on public.return_claims (created_at) where seen_at is null;
notify pgrst, 'reload schema';
