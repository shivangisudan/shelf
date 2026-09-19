-- Shelf — database and storage setup.
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ DEMO-PERMISSIVE, NOT PRODUCTION-SAFE.                                   │
-- │ Shelf has no auth and no accounts: a single demo store, one shared      │
-- │ catalog. Every policy below grants the `anon` role blanket access, so   │
-- │ anyone holding the publishable key can read the whole table and insert  │
-- │ rows into it. That is deliberate for a demo. Before this goes anywhere  │
-- │ real, add auth, add a store/owner column, and rewrite every policy to   │
-- │ scope rows to the authenticated owner.                                  │
-- └─────────────────────────────────────────────────────────────────────────┘


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  name              text        not null,
  canonical_name    text,
  category          text        not null,
  description       text        not null default '',
  language_detected text        not null default '',
  price             numeric,
  quantity_unit     text,
  stock_quantity    numeric not null default 0 check (stock_quantity >= 0),
  stock_unit        text,
  low_stock_threshold numeric not null default 0 check (low_stock_threshold >= 0),
  image_url         text,
  audio_url         text,
  created_at        timestamptz not null default now()
);

-- Safe migration for demo databases created before inventory was added.
alter table public.products add column if not exists stock_quantity numeric not null default 0;
alter table public.products add column if not exists canonical_name text;
alter table public.products add column if not exists stock_unit text;
alter table public.products add column if not exists low_stock_threshold numeric not null default 0;
alter table public.products drop constraint if exists products_stock_quantity_check;
alter table public.products add constraint products_stock_quantity_check check (stock_quantity >= 0);
alter table public.products drop constraint if exists products_low_stock_threshold_check;
alter table public.products add constraint products_low_stock_threshold_check check (low_stock_threshold >= 0);

-- One product is one row, and canonical_name is what decides when two captures
-- are the same product. This mirrors canonicalProductName in lib/catalog.ts and
-- is the only copy of the rule in SQL — the dedupe migration calls it too.
--
-- [:alnum:] rather than a-zA-Z0-9 so Devanagari, Tamil and Bengali names keep a
-- real key. The ASCII-only version collapsed every Indic name to '', which then
-- made unrelated products look identical.
--
-- Known, accepted divergence from the TypeScript version: it folds accents
-- ("café" -> "cafe") and this does not, because unaccent is not assumed to be
-- installed. Harmless in practice — the app always writes canonical_name from
-- TypeScript, and this function only ever runs as a backfill for legacy rows.
create or replace function public.canonical_product_name(p_name text)
returns text
language sql
immutable
as $$
  with compact as (
    select lower(regexp_replace(coalesce(p_name, ''), '[^[:alnum:]]+', '', 'g')) as name
  )
  select case
    when name in ('aata', 'flour', 'wheatflour') then 'atta'
    when name in ('cheeni', 'chini', 'shakkar') then 'sugar'
    else name
  end
  from compact;
$$;

-- Units the merchant typed, grouped by what they mean. Comparison only — the
-- merchant's own wording stays in stock_unit. Mirrors normalizeUnit in
-- lib/catalog.ts.
create or replace function public.normalize_stock_unit(p_unit text)
returns text
language sql
immutable
as $$
  with compact as (
    select nullif(rtrim(lower(btrim(coalesce(p_unit, ''))), '.'), '') as unit
  )
  select case
    when unit in ('packet', 'packets', 'pack', 'packs', 'pkt', 'pkts') then 'packet'
    when unit in ('kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kilogramme') then 'kg'
    when unit in ('g', 'gm', 'gms', 'gram', 'grams') then 'g'
    when unit in ('l', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters') then 'l'
    when unit in ('ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters') then 'ml'
    when unit in ('piece', 'pieces', 'pcs', 'pc', 'nos') then 'piece'
    when unit in ('unit', 'units') then 'unit'
    when unit in ('bottle', 'bottles') then 'bottle'
    when unit in ('tube', 'tubes') then 'tube'
    when unit in ('box', 'boxes') then 'box'
    when unit in ('bag', 'bags') then 'bag'
    when unit in ('pouch', 'pouches') then 'pouch'
    when unit in ('dozen', 'dozens') then 'dozen'
    else unit
  end
  from compact;
$$;

-- Unknown on either side is permissive; only two known, different units clash.
-- 'mixed' is what a dedupe merge writes when it had to combine incompatible
-- units, so it means "unknown", not "a unit that conflicts with everything".
create or replace function public.compatible_stock_units(p_first text, p_second text)
returns boolean
language sql
immutable
as $$
  with pair as (
    select public.normalize_stock_unit(p_first) as a,
           public.normalize_stock_unit(p_second) as b
  )
  select a is null or b is null or a = 'mixed' or b = 'mixed' or a = b
  from pair;
$$;

update public.products
set canonical_name = public.canonical_product_name(name)
where canonical_name is null or canonical_name = '';

create index if not exists products_canonical_name_idx
  on public.products (canonical_name);

-- The catalog list is always ordered newest first.
create index if not exists products_created_at_idx
  on public.products (created_at desc);

-- The database, not just the app, is what guarantees one row per product.
-- A catalog that still holds duplicates cannot take the index yet, so say so
-- and carry on rather than failing the whole setup script.
do $$
declare
  duplicate_groups integer;
begin
  select count(*) into duplicate_groups
  from (
    select canonical_name
    from public.products
    where canonical_name is not null and canonical_name <> ''
    group by canonical_name
    having count(*) > 1
  ) grouped;

  if duplicate_groups > 0 then
    raise notice
      'Skipped products_canonical_name_unique_idx: % canonical name(s) still have duplicate rows. Run supabase/dedupe_catalog.sql, then run this file again.',
      duplicate_groups;
  else
    create unique index if not exists products_canonical_name_unique_idx
      on public.products (canonical_name)
      where canonical_name is not null and canonical_name <> '';
  end if;
end;
$$;

-- Keep the category column inside the app's taxonomy. This must stay in step
-- with CATEGORIES in lib/taxonomy.ts.
alter table public.products
  drop constraint if exists products_category_check;
alter table public.products
  add constraint products_category_check check (
    category in (
      'Grocery & Staples',
      'Snacks & Beverages',
      'Personal Care',
      'Household',
      'Stationery',
      'Apparel & Textiles',
      'Handicrafts',
      'Other'
    )
  );

-- Inventory history is append-only. Current stock lives on products for fast
-- reads; every mutation also records the quantity after the change here.
create table if not exists public.inventory_events (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  event_type      text not null check (event_type in ('extraction', 'restock', 'out_of_stock', 'adjustment')),
  quantity_delta  numeric not null,
  quantity_after  numeric not null check (quantity_after >= 0),
  unit            text,
  source          text not null default 'catalog',
  created_at      timestamptz not null default now()
);

create index if not exists inventory_events_product_created_idx
  on public.inventory_events (product_id, created_at desc);
create index if not exists inventory_events_created_idx
  on public.inventory_events (created_at desc);

alter table public.products enable row level security;
alter table public.inventory_events enable row level security;

drop policy if exists "demo anon update products" on public.products;
create policy "demo anon update products"
  on public.products for update to anon using (true) with check (true);

drop policy if exists "demo anon select inventory events" on public.inventory_events;
create policy "demo anon select inventory events"
  on public.inventory_events for select to anon using (true);

drop policy if exists "demo anon insert inventory events" on public.inventory_events;
create policy "demo anon insert inventory events"
  on public.inventory_events for insert to anon with check (true);

-- Apply a stock transition and its history row atomically.
create or replace function public.apply_inventory_event(
  p_product_id uuid,
  p_event_type text,
  p_quantity_delta numeric,
  p_unit text default null,
  p_source text default 'catalog'
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_product public.products;
  next_quantity numeric;
begin
  select * into updated_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Product not found'; end if;

  next_quantity := case
    when p_event_type = 'out_of_stock' then 0
    else greatest(0, updated_product.stock_quantity + p_quantity_delta)
  end;

  update public.products
  set stock_quantity = next_quantity,
      stock_unit = coalesce(p_unit, stock_unit)
  where id = p_product_id
  returning * into updated_product;

  insert into public.inventory_events (product_id, event_type, quantity_delta, quantity_after, unit, source)
  values (p_product_id, p_event_type, p_quantity_delta, next_quantity, updated_product.stock_unit, p_source);

  return updated_product;
end;
$$;

grant execute on function public.apply_inventory_event(uuid, text, numeric, text, text) to anon;

-- Add one reviewed product to the catalog: find-or-insert by canonical_name,
-- then record its opening stock, both in a single transaction.
--
-- Doing this from the browser could not be made safe. Two saves firing at once
-- would both read "no such product" and both insert, and the second one would
-- only fail once a unique index existed — by which point the merchant had
-- already seen a raw Postgres error. Here, the loser of that race is caught
-- below and its stock is added to the row that won.
create or replace function public.save_reviewed_product(
  p_name text,
  p_canonical_name text,
  p_category text,
  p_description text,
  p_language_detected text,
  p_price numeric,
  p_quantity_unit text,
  p_stock_unit text,
  p_low_stock_threshold numeric,
  p_image_url text,
  p_audio_url text,
  p_initial_stock numeric
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.products;
begin
  -- An empty canonical name means the name had nothing to key on, so it can
  -- never match an existing product and always becomes its own row.
  if p_canonical_name <> '' then
    select * into target
    from public.products
    where canonical_name = p_canonical_name
    order by created_at, id
    limit 1
    for update;
  end if;

  if target.id is null then
    begin
      insert into public.products (
        name, canonical_name, category, description, language_detected,
        price, quantity_unit, stock_quantity, stock_unit,
        low_stock_threshold, image_url, audio_url
      )
      values (
        p_name, p_canonical_name, p_category, p_description, p_language_detected,
        p_price, p_quantity_unit, 0, p_stock_unit,
        coalesce(p_low_stock_threshold, 0), p_image_url, p_audio_url
      )
      returning * into target;
    exception when unique_violation then
      -- A concurrent save inserted this product between our read and our write.
      select * into target
      from public.products
      where canonical_name = p_canonical_name
      order by created_at, id
      limit 1
      for update;

      if target.id is null then
        raise exception 'Could not save %. Try again.', p_name;
      end if;
    end;
  end if;

  if not public.compatible_stock_units(target.stock_unit, p_stock_unit) then
    raise exception '% already uses %. Review the stock unit before adding it.',
      p_name, coalesce(target.stock_unit, 'another unit');
  end if;

  -- All stock movement goes through the one function that also writes history.
  -- A 'mixed' unit was written by a dedupe merge to mean "this total spans more
  -- than one unit"; passing null leaves it alone rather than relabelling the
  -- whole quantity with whatever the merchant just said.
  return public.apply_inventory_event(
    target.id,
    'extraction',
    coalesce(p_initial_stock, 0),
    case when public.normalize_stock_unit(target.stock_unit) = 'mixed' then null else p_stock_unit end,
    'catalog'
  );
end;
$$;

grant execute on function public.save_reviewed_product(
  text, text, text, text, text, numeric, text, text, numeric, text, text, numeric
) to anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Row Level Security — demo-permissive (see the banner above)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.products enable row level security;

drop policy if exists "demo anon select products" on public.products;
create policy "demo anon select products"
  on public.products
  for select
  to anon
  using (true);

drop policy if exists "demo anon insert products" on public.products;
create policy "demo anon insert products"
  on public.products
  for insert
  to anon
  with check (true);

-- No update or delete policy: with RLS on, both are denied by default. The app
-- only ever captures and lists, so nothing needs them.


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Storage bucket "captures" — photos and voice notes
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Either run the SQL below, or do it in the dashboard:
--   Storage → New bucket → name "captures" → toggle "Public bucket" on →
--   Create. Then Storage → captures → Policies → add the two anon policies.
--
-- A public bucket means every uploaded photo and voice note is readable by
-- anyone with the URL. Demo-only, same caveat as above.

insert into storage.buckets (id, name, public)
values ('captures', 'captures', true)
on conflict (id) do update set public = true;

drop policy if exists "demo anon read captures" on storage.objects;
create policy "demo anon read captures"
  on storage.objects
  for select
  to anon
  using (bucket_id = 'captures');

drop policy if exists "demo anon insert captures" on storage.objects;
create policy "demo anon insert captures"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'captures');
