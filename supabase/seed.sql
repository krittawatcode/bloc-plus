-- Make someone staff after creating their user in Authentication › Users.
-- Replace the email and run this in SQL Editor.
insert into public.staff (user_id)
select id from auth.users where email = 'you@example.com'
on conflict do nothing;
