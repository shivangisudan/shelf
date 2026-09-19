-- Shelf demo seed data
-- Run supabase/schema.sql first, then run this file in the Supabase SQL editor.
-- Safe to run repeatedly: product and event IDs are deterministic.

insert into public.products (
  id, name, category, description, language_detected, price, quantity_unit,
  stock_quantity, stock_unit, low_stock_threshold, created_at
)
values
  ('10000000-0000-4000-8000-000000000001', 'Aashirvaad Atta', 'Grocery & Staples', 'Whole wheat flour for everyday cooking.', 'English', 265, '10 kg', 6, 'bags', 2, now() - interval '3 days'),
  ('10000000-0000-4000-8000-000000000002', 'Tata Salt', 'Grocery & Staples', 'Iodised salt for household cooking.', 'English', 28, '1 kg', 18, 'packets', 5, now() - interval '2 days'),
  ('10000000-0000-4000-8000-000000000003', 'Parle-G', 'Snacks & Beverages', 'Glucose biscuits in a family pack.', 'Hindi', 10, 'pack', 32, 'packs', 8, now() - interval '2 days'),
  ('10000000-0000-4000-8000-000000000004', 'Maggi 2-Minute Noodles', 'Snacks & Beverages', 'Instant noodles in a two-minute pack.', 'Hindi', 14, '70 g', 9, 'packets', 10, now() - interval '1 day'),
  ('10000000-0000-4000-8000-000000000005', 'Surf Excel Matic', 'Household', 'Laundry detergent powder for washing machines.', 'English', 210, '2 kg', 0, 'packs', 2, now() - interval '5 days'),
  ('10000000-0000-4000-8000-000000000006', 'Colgate Strong Teeth', 'Personal Care', 'Fluoride toothpaste for daily brushing.', 'English', 95, '200 g', 14, 'tubes', 4, now() - interval '4 days')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  language_detected = excluded.language_detected,
  price = excluded.price,
  quantity_unit = excluded.quantity_unit,
  stock_quantity = excluded.stock_quantity,
  stock_unit = excluded.stock_unit,
  low_stock_threshold = excluded.low_stock_threshold;

insert into public.inventory_events (
  id, product_id, event_type, quantity_delta, quantity_after, unit, source, created_at
)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'extraction', 6, 6, 'bags', 'seed', now() - interval '3 days'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'extraction', 18, 18, 'packets', 'seed', now() - interval '2 days'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'extraction', 32, 32, 'packs', 'seed', now() - interval '2 days'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'extraction', 9, 9, 'packets', 'seed', now() - interval '1 day'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'extraction', 12, 12, 'packs', 'seed', now() - interval '5 days'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'extraction', 14, 14, 'tubes', 'seed', now() - interval '4 days'),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000005', 'out_of_stock', -12, 0, 'packs', 'seed', now() - interval '1 day')
on conflict (id) do nothing;
