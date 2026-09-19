-- Consolidate duplicate catalog rows, then stop new ones being created.
--
-- Run supabase/schema.sql FIRST — this migration uses the canonical_name and
-- stock-unit helpers it defines. Then paste this whole file into the Supabase
-- SQL editor and run it. It is safe to run again: a second run finds nothing
-- to merge and changes nothing.
--
-- What it guarantees:
--   * no stock is lost — duplicate quantities are summed into the keeper;
--   * no history is lost — inventory events are re-pointed at the keeper
--     before any row is deleted, and every merge leaves an audit event behind;
--   * duplicates that used incompatible units are still summed, and the
--     keeper's unit becomes 'mixed' so the total is not silently mislabelled.
--     Those products are listed in a NOTICE for you to review afterwards.

begin;

do $$
begin
  if to_regprocedure('public.canonical_product_name(text)') is null
     or to_regprocedure('public.compatible_stock_units(text, text)') is null then
    raise exception
      'Run supabase/schema.sql first — it defines the canonical_name and stock-unit helpers this migration needs.';
  end if;
end;
$$;

-- 1. Give every row a canonical key. This has to happen before the keeper map
--    is built, or rows that only differ by spelling will not be seen as
--    duplicates at all.
update public.products
set canonical_name = public.canonical_product_name(name)
where canonical_name is null or canonical_name = '';

-- 2. One keeper per canonical product: the oldest row, so the catalog keeps
--    the entry the merchant created first.
--
--    Rows whose canonical_name is still empty are excluded. Their name had no
--    letters or digits to key on, so they are not duplicates of each other and
--    collapsing them together would destroy unrelated products.
create temporary table catalog_duplicate_map on commit drop as
select id as duplicate_id,
       canonical_name,
       first_value(id) over (partition by canonical_name order by created_at, id) as keeper_id
from public.products
where canonical_name is not null and canonical_name <> '';

delete from catalog_duplicate_map where duplicate_id = keeper_id;

-- 3. Work out the merged stock and unit for each keeper before touching
--    anything, so the audit events below can record the real "after" value.
create temporary table catalog_merge_plan on commit drop as
select keeper.id as keeper_id,
       keeper.canonical_name,
       totals.absorbed_stock,
       keeper.stock_quantity + totals.absorbed_stock as merged_stock,
       case
         when totals.distinct_units <= 1
              and public.compatible_stock_units(keeper.stock_unit, totals.duplicate_unit)
           then coalesce(keeper.stock_unit, totals.duplicate_unit)
         else 'mixed'
       end as merged_unit
from (
  select mapping.keeper_id,
         coalesce(sum(duplicate.stock_quantity), 0) as absorbed_stock,
         count(distinct public.normalize_stock_unit(duplicate.stock_unit)) as distinct_units,
         min(duplicate.stock_unit) filter (where duplicate.stock_unit is not null) as duplicate_unit
  from catalog_duplicate_map mapping
  join public.products duplicate on duplicate.id = mapping.duplicate_id
  group by mapping.keeper_id
) totals
join public.products keeper on keeper.id = totals.keeper_id;

-- 4. Merge the stock into the keeper.
update public.products keeper
set stock_quantity = plan.merged_stock,
    stock_unit = plan.merged_unit
from catalog_merge_plan plan
where keeper.id = plan.keeper_id;

-- 5. Record why the keeper's stock jumped, so the history still adds up.
insert into public.inventory_events (product_id, event_type, quantity_delta, quantity_after, unit, source)
select plan.keeper_id, 'adjustment', plan.absorbed_stock, plan.merged_stock, plan.merged_unit, 'dedupe-migration'
from catalog_merge_plan plan;

-- 6. Re-point history at the keeper BEFORE the duplicate rows go away. The
--    foreign key cascades on delete, so doing this in the other order would
--    destroy the events instead of moving them.
update public.inventory_events event
set product_id = mapping.keeper_id
from catalog_duplicate_map mapping
where event.product_id = mapping.duplicate_id;

delete from public.products product
using catalog_duplicate_map mapping
where product.id = mapping.duplicate_id;

-- 7. Say which products need a human to look at their unit.
do $$
declare
  mixed_names text;
begin
  select string_agg(canonical_name, ', ' order by canonical_name)
  into mixed_names
  from catalog_merge_plan
  where merged_unit = 'mixed';

  if mixed_names is not null then
    raise notice
      'Merged rows that used incompatible units. Quantities were summed and kept; stock_unit is now "mixed" for: %',
      mixed_names;
  end if;
end;
$$;

-- 8. Stop the database from ever accepting a duplicate again.
create unique index if not exists products_canonical_name_unique_idx
  on public.products (canonical_name)
  where canonical_name is not null and canonical_name <> '';

commit;
