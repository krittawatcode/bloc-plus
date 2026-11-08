-- Bloc+: route tags.
-- Staff keep the gym's list of tags (like "No dyno" or "Sit start") in settings and can add their own.
-- Routes keep their chosen tags in routes.rules, as before.

alter table public.settings
  add column tags jsonb not null default
    '["Feet follow hands","No dyno","Volume is on","Volume is off","Sit start","Match on top","Marked feet only"]'::jsonb;
