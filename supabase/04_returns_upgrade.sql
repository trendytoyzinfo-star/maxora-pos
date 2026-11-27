-- TrendyToyz returns upgrade. Run once in Supabase -> SQL Editor. Safe to run again.
-- Customer return requests (with reason + photos). Admin accepts or rejects.
create table if not exists public.return_claims (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  reason text not null check (reason in ('damaged','wrong_item','size')),
  details text,
  photos text[] not null default '{}',
  status text not null default 'requested' check (status in ('requested','approved','rejected','received','refunded')),
  refund_amount numeric,
  admin_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists return_claims_one_per_order on public.return_claims(order_id);
alter table public.return_claims enable row level security;      -- no policies: only the server key can use it
revoke all on public.return_claims from anon, authenticated;
grant all on public.return_claims to service_role;

-- Private storage for the customers' return photos (not public).
insert into storage.buckets (id, name, public) values ('return-proofs', 'return-proofs', false) on conflict (id) do nothing;
