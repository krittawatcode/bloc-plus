-- Bloc+: climbers rate routes 1 to 5 stars.
-- Like sends, a rating belongs to the phone's random device id (no login). One rating per phone per
-- route; rating again replaces it. Climbers change ratings only through rate_route().

create table public.ratings (
  route_id text not null references public.routes (id) on delete cascade,
  device_id text not null check (char_length(device_id) <= 64),
  stars smallint not null check (stars between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (route_id, device_id)
);

create view public.rating_stats with (security_invoker = true) as
  select route_id, count(*)::int as n, round(avg(stars), 2)::float8 as avg
  from public.ratings group by route_id;

alter table public.ratings enable row level security;
create policy "read ratings" on public.ratings for select using (true);
create policy "staff remove ratings" on public.ratings for delete to authenticated using (public.is_staff());

-- Set this phone's rating on a route, or clear it with stars = null.
create function public.rate_route(rid text, did text, stars int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if stars is null then
    delete from public.ratings where route_id = rid and device_id = did;
  else
    insert into public.ratings (route_id, device_id, stars) values (rid, did, stars)
    on conflict (route_id, device_id) do update set stars = excluded.stars, updated_at = now();
  end if;
end;
$$;
grant execute on function public.rate_route(text, text, int) to anon, authenticated;
