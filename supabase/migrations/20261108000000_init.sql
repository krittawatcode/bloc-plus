-- Bloc+: initial schema.
-- Apply with the Supabase CLI (`supabase db push`) or paste into SQL Editor › New query › Run.
--
-- Who can do what:
--   everyone (no login)   read settings, walls, holds, routes, visible comments, send counts;
--                         post comments, report comments, add comment photos, log sends
--   staff (rows in staff) everything else
-- A signed-in user is NOT staff until their id is added to public.staff.

-- ---------- Staff ----------
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;
grant execute on function public.is_staff() to anon, authenticated;

-- ---------- Tables ----------
create table public.settings (
  id int primary key default 1 check (id = 1),
  gym_name text not null default 'My gym',
  grading jsonb not null,
  qr_link text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.settings (id, gym_name, grading) values (1, 'My gym',
  '{"system":"number","levels":[
    {"id":"t0","label":"0"},{"id":"t1","label":"1"},{"id":"t2","label":"2"},{"id":"t3","label":"3"},
    {"id":"t4","label":"4"},{"id":"t5","label":"5"},{"id":"t6","label":"6"},{"id":"t7","label":"7"},
    {"id":"t8","label":"8"},{"id":"tunknown","label":"Unknown","special":true},
    {"id":"tsurprise","label":"Surprise","special":true}]}'::jsonb);

create table public.walls (
  id text primary key,
  name text not null check (char_length(name) between 1 and 40),
  scan_path text,
  ghost_path text,
  upright boolean not null default false,
  spin int not null default 0 check (spin between 0 and 3),
  tris int,
  created_at timestamptz not null default now()
);

create table public.holds (
  id text primary key,
  wall_id text not null references public.walls (id) on delete cascade,
  kind text not null check (kind in ('hold', 'volume', 'marker')),
  c jsonb not null,            -- centre [x, y, z] in metres
  r double precision not null, -- cut-out radius in metres
  n jsonb not null,            -- outward normal [x, y, z]
  on_id text references public.holds (id) on delete cascade, -- marker: the bigger hold it sits on
  piece_path text not null,    -- storage path of this hold's small 3D file
  created_at timestamptz not null default now()
);
create index holds_wall_idx on public.holds (wall_id);

create table public.routes (
  id text primary key,
  wall_id text not null,       -- a wall id, or 'practice' for the built-in practice wall
  type text not null check (type in ('base', 'elim', 'new')),
  base_id text references public.routes (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  grade text,
  color text,
  section text,
  description text check (char_length(description) <= 400),
  rules jsonb not null default '[]'::jsonb,
  holds jsonb not null default '{}'::jsonb,
  setter text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index routes_wall_idx on public.routes (wall_id);

-- Starter routes on the practice wall, so staff can try setting extras straight away.
insert into public.routes (id, wall_id, type, name, grade, color, section, holds) values
  ('practice-yellow', 'practice', 'base', 'Yellow', 't1', '#F2C230', 'Slab · 10°', '{"p1":"foot","p2":"start","p3":"hand","p4":"hand","p5":"hand","p6":"hand","p7":"hand","p8":"top"}'::jsonb),
  ('practice-blue', 'practice', 'base', 'Blue', 't3', '#2D6FD6', 'Vertical into a 42° roof', '{"p9":"foot","p10":"start","p11":"hand","p12":"hand","p13":"hand","p14":"hand","p15":"top"}'::jsonb),
  ('practice-pink', 'practice', 'base', 'Pink', 't5', '#E5559A', 'Overhang · 29°', '{"p16":"foot","p17":"start","p18":"hand","p19":"hand","p20":"hand","p21":"hand","p22":"top","v2":"hand"}'::jsonb);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  route_id text not null references public.routes (id) on delete cascade,
  nick text not null check (char_length(nick) between 1 and 24),
  body text not null default '' check (char_length(body) <= 500),
  beta boolean not null default false,
  photo_path text,
  hidden boolean not null default false,
  reported boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_route_idx on public.comments (route_id);

create table public.sends (
  route_id text not null references public.routes (id) on delete cascade,
  device_id text not null check (char_length(device_id) <= 64),
  created_at timestamptz not null default now(),
  primary key (route_id, device_id)
);

create view public.send_counts with (security_invoker = true) as
  select route_id, count(*)::int as n from public.sends group by route_id;

-- Climbers report a comment without being able to change anything else.
create function public.report_comment(cid uuid) returns void
language sql security definer set search_path = public as $$
  update public.comments set reported = true where id = cid and hidden = false;
$$;
grant execute on function public.report_comment(uuid) to anon, authenticated;

-- ---------- Row level security ----------
alter table public.staff enable row level security;
alter table public.settings enable row level security;
alter table public.walls enable row level security;
alter table public.holds enable row level security;
alter table public.routes enable row level security;
alter table public.comments enable row level security;
alter table public.sends enable row level security;

create policy "staff see staff" on public.staff for select to authenticated using (public.is_staff());

create policy "read settings" on public.settings for select using (true);
create policy "staff change settings" on public.settings for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "read walls" on public.walls for select using (true);
create policy "staff change walls" on public.walls for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "read holds" on public.holds for select using (true);
create policy "staff change holds" on public.holds for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "read routes" on public.routes for select using (true);
create policy "staff change routes" on public.routes for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "read visible comments" on public.comments for select using (hidden = false or public.is_staff());
create policy "anyone comments" on public.comments for insert with check (hidden = false and reported = false);
create policy "staff moderate comments" on public.comments for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "staff delete comments" on public.comments for delete to authenticated using (public.is_staff());

create policy "read sends" on public.sends for select using (true);
create policy "anyone sends" on public.sends for insert with check (true);
create policy "staff remove sends" on public.sends for delete to authenticated using (public.is_staff());

-- ---------- File storage ----------
-- scans:  wall scans, wall outlines and per-hold files. Public to read, staff to write. 50 MB per file.
-- photos: comment photos. Public to read, anyone can add a small JPEG, staff can delete.
insert into storage.buckets (id, name, public, file_size_limit)
values ('scans', 'scans', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

create policy "staff manage scans" on storage.objects for all to authenticated
  using (bucket_id = 'scans' and public.is_staff()) with check (bucket_id = 'scans' and public.is_staff());
create policy "anyone adds photos" on storage.objects for insert
  with check (bucket_id = 'photos');
create policy "staff delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_staff());
