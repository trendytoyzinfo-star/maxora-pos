-- TrendyToyz: record payments that arrived but could not confirm an order (so they get refunded).
-- Run once in Supabase -> SQL Editor. Safe to run again.
create table if not exists public.payment_issues (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  razorpay_payment_id text not null,
  amount_paise int,
  reason text,
  detail text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists payment_issues_payment_uq on public.payment_issues (razorpay_payment_id);
alter table public.payment_issues enable row level security;   -- no policies = only the server key can touch it
revoke all on public.payment_issues from anon, authenticated;
