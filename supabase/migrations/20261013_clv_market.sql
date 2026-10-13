-- Marketplace & portfolio: financial products offered at emission (primary) or traded between
-- owners (secondary), holdings, coupon payments and the documentation-access audit required for
-- private placement / prospectus-exemption compliance. Service role only (edge function clv-market).

-- Per-user feature switches, set by staff at enrolment and editable afterwards:
--   { "market": bool, "trading": bool, "products": null | [product uuid, ...] }
--   market   – may open the Marketplace (null/absent = off)
--   trading  – may list holdings for sale and buy from other owners (secondary market)
--   products – null = every product; otherwise only the listed products are visible/subscribable
alter table clv_profiles add column if not exists features jsonb not null default '{}'::jsonb;

create table if not exists clv_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                      -- short reference, e.g. VBF-2026-A
  name text not null,
  type text not null default 'private_bond' check (type in ('private_bond','sicav_share','note','other')),
  status text not null default 'upcoming' check (status in ('upcoming','open','closed','matured','cancelled')),
  issuer_name text not null,
  issuer_id text,                                 -- registration / LEI
  issuer_country text,
  issuer_description text,
  isin text,
  currency text not null default 'EUR',
  nominal numeric(18,2) not null default 1000,    -- nominal per unit
  min_units int not null default 1,
  total_units int,                                -- size of the issue in units (null = uncapped)
  coupon_rate numeric(8,4),                       -- annual %, null for non-coupon products
  coupon_frequency text not null default 'annual' check (coupon_frequency in ('annual','semi','quarterly','monthly','none')),
  issue_date date,
  first_coupon_date date,
  maturity_date date,
  subscription_opens date,
  subscription_closes date,
  description text,
  highlights text,                                -- short bullet lines, one per line
  nextcloud_folder text,                          -- full documentation (prospectus/info memorandum, terms, ...)
  secondary_enabled boolean not null default false,
  max_investors int,                              -- prospectus-exemption ceiling (e.g. 150 non-qualified investors per member state)
  created_by uuid references clv_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table clv_products enable row level security;

-- Primary market: subscription at emission. Settled subscriptions become holdings.
create table if not exists clv_subscriptions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references clv_products(id) on delete cascade,
  user_id uuid not null references clv_profiles(id),
  units int not null check (units > 0),
  amount numeric(18,2) not null,
  status text not null default 'requested' check (status in ('requested','accepted','settled','cancelled','rejected')),
  contract_id uuid references clv_contracts(id),  -- executed subscription documentation (QES)
  note text,
  ip text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  settled_at timestamptz,
  closed_at timestamptz
);
alter table clv_subscriptions enable row level security;
create index if not exists clv_subscriptions_user on clv_subscriptions (user_id);
create index if not exists clv_subscriptions_product on clv_subscriptions (product_id);

-- Holdings (one row per acquisition; the portfolio aggregates per product).
create table if not exists clv_holdings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references clv_products(id) on delete cascade,
  user_id uuid not null references clv_profiles(id),
  units int not null check (units >= 0),
  price_per_unit numeric(18,2) not null,
  source text not null check (source in ('subscription','secondary','transfer')),
  subscription_id uuid references clv_subscriptions(id),
  listing_id uuid,
  contract_id uuid references clv_contracts(id),
  acquired_at timestamptz not null default now(),
  note text
);
alter table clv_holdings enable row level security;
create index if not exists clv_holdings_user on clv_holdings (user_id);
create index if not exists clv_holdings_product on clv_holdings (product_id);

-- Secondary market: an owner lists units for sale, another entitled investor buys, staff settles.
create table if not exists clv_listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references clv_products(id) on delete cascade,
  seller_id uuid not null references clv_profiles(id),
  units int not null check (units > 0),
  price_per_unit numeric(18,2) not null,
  status text not null default 'open' check (status in ('open','matched','settled','cancelled')),
  buyer_id uuid references clv_profiles(id),
  contract_id uuid references clv_contracts(id),  -- executed transfer agreement (QES)
  created_at timestamptz not null default now(),
  matched_at timestamptz,
  settled_at timestamptz,
  cancelled_at timestamptz
);
alter table clv_listings enable row level security;
create index if not exists clv_listings_product on clv_listings (product_id, status);

-- Coupon payments made to holders (staff records them; the schedule itself derives from the terms).
create table if not exists clv_coupon_payments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references clv_products(id) on delete cascade,
  user_id uuid not null references clv_profiles(id),
  due_date date not null,
  amount numeric(18,2) not null,
  paid_at timestamptz,
  reference text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (product_id, user_id, due_date)
);
alter table clv_coupon_payments enable row level security;

-- Documentation-access audit: every investor who opened a product, its full documentation or a
-- document inside it. Admin reports count distinct investors per product (prospectus compliance).
create table if not exists clv_product_access (
  id bigserial primary key,
  product_id uuid not null references clv_products(id) on delete cascade,
  user_id uuid not null references clv_profiles(id),
  kind text not null check (kind in ('view','docs','download','subscribe','list','buy')),
  path text,
  sha256 text,
  ip text,
  user_agent text,
  ts timestamptz not null default now()
);
alter table clv_product_access enable row level security;
create index if not exists clv_product_access_product on clv_product_access (product_id, user_id);
create index if not exists clv_product_access_user on clv_product_access (user_id, ts desc);

grant all on clv_products, clv_subscriptions, clv_holdings, clv_listings, clv_coupon_payments, clv_product_access to service_role;
grant usage, select on sequence clv_product_access_id_seq to service_role;
notify pgrst, 'reload schema';
