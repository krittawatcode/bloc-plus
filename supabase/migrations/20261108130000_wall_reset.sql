-- Bloc+: wall resets.
-- A reset uploads a new scan as a new wall row. The old wall is kept (scan, holds, routes,
-- sends and comments) and marked retired, so staff can still look back at its stats.

alter table public.walls
  add column retired_at timestamptz,
  add column replaced_by text references public.walls (id) on delete set null;

create index walls_current_idx on public.walls (retired_at) where retired_at is null;
