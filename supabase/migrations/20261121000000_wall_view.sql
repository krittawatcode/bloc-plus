-- Bloc+: a start view per wall.
-- Staff turn and zoom the 3D wall the way it should open, then save it:
-- {"pos":[x,y,z],"target":[x,y,z]} in scan coordinates. Null means "fit the whole wall".

alter table public.walls
  add column default_view jsonb;
