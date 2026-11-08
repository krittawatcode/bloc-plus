-- Bloc+: climbers can untick "I sent it".
-- Sends have no login, only the phone's random device id, so a phone removes its own send by
-- passing that id. Nothing else about sends can be changed without staff rights.

create function public.remove_send(rid text, did text) returns void
language sql security definer set search_path = public as $$
  delete from public.sends where route_id = rid and device_id = did;
$$;
grant execute on function public.remove_send(text, text) to anon, authenticated;
