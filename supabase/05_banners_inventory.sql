-- TrendyToyz: banners + low stock alert. Run once in Supabase -> SQL Editor. Safe to run again.
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  subtitle text,
  button_text text,
  link_url text,
  image_path text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.banners enable row level security;
drop policy if exists "banners are public" on public.banners;
create policy "banners are public" on public.banners for select to anon, authenticated using (is_active);
grant select on public.banners to anon, authenticated;
grant all on public.banners to service_role;

alter table public.store_settings add column if not exists low_stock_threshold int not null default 5;
