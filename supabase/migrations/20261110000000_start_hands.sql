-- Bloc+: which hand goes on each start hold.
-- A map of hold id → 'left' | 'right' | 'both'. A start hold missing from the map is "any hand".

alter table public.routes
  add column start_hands jsonb not null default '{}'::jsonb;
