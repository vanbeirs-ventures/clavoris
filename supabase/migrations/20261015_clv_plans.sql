-- Company-account subscriptions.
-- clv_plans: the four tiers and what each includes (modules with the number of instances per module,
-- users per company account, white label). Prices in EUR per month excl. VAT; null = on quotation.
-- A module limit of null means unlimited; a module missing from "modules" is not included.
-- clv_plan_subscriptions (not clv_subscriptions, which holds investor subscriptions to marketplace products):
-- one active subscription per company account; requests made by users from the
-- account page wait (status requested / quote_requested) until Clavoris activates them.
-- Reads and writes go through the edge function clv-subscription (service role); plans are public to
-- signed-in users so the plans page can show them.

create table if not exists public.clv_plans (
  code text primary key check (code in ('free', 'starter', 'professional', 'enterprise')),
  sort int not null,
  price_month_eur numeric(10,2),           -- null = on quotation
  max_users int,                           -- users within the company account; null = unlimited
  white_label boolean not null default false,
  modules jsonb not null default '{}'::jsonb, -- { "data_rooms": 1, "contracts": 3, ... }; null value = unlimited
  updated_at timestamptz not null default now()
);
alter table public.clv_plans enable row level security;
create policy clv_plans_read on public.clv_plans for select to authenticated using (true);

insert into public.clv_plans (code, sort, price_month_eur, max_users, white_label, modules) values
  ('free',         1,   0, 2,    false, '{"data_rooms": 1}'),
  ('starter',      2,  99, 10,   false, '{"data_rooms": 3, "contracts": 3}'),
  ('professional', 3, 199, 50,   false, '{"data_rooms": 10, "contracts": 10, "marketplace": 5, "portfolio": 5}'),
  ('enterprise',   4, null, null, true, '{"data_rooms": null, "contracts": null, "marketplace": null, "portfolio": null}')
on conflict (code) do nothing;

create table if not exists public.clv_plan_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.clv_companies(id) on delete cascade, -- null while a requested company is not yet set up
  company_name text not null,
  plan_code text not null references public.clv_plans(code),
  status text not null check (status in ('active', 'requested', 'quote_requested', 'cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  request jsonb not null default '{}'::jsonb,  -- company details given with the request
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
create unique index if not exists clv_plan_subscriptions_one_active on public.clv_plan_subscriptions (company_id) where status = 'active';
create index if not exists clv_plan_subscriptions_requested_by on public.clv_plan_subscriptions (requested_by);
alter table public.clv_plan_subscriptions enable row level security;  -- service role only

-- Minerva Luxury Motors Holding BV (in oprichting): Enterprise.
insert into public.clv_plan_subscriptions (company_id, company_name, plan_code, status, activated_at)
select c.id, c.name, 'enterprise', 'active', now() from public.clv_companies c
 where c.id = '71d73e67-8355-46d7-8a62-94bc9b290d69'
   and not exists (select 1 from public.clv_plan_subscriptions s where s.company_id = c.id and s.status = 'active');
