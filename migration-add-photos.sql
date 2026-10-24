-- Adds photo support to an EXISTING microblog database.
-- Paste into Supabase > SQL Editor > New query, then Run. Safe to run more than once.
-- (If you are setting up from scratch, setup.sql already includes all of this.)

alter table public.posts add column if not exists images text[] not null default '{}';

-- Post photos (public read, admin-only write)
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

drop policy if exists "public reads post images" on storage.objects;
create policy "public reads post images"
  on storage.objects for select
  using (bucket_id = 'post-images');

drop policy if exists "admin uploads post images" on storage.objects;
create policy "admin uploads post images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'post-images' and public.is_admin());

drop policy if exists "admin updates post images" on storage.objects;
create policy "admin updates post images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'post-images' and public.is_admin());

drop policy if exists "admin deletes post images" on storage.objects;
create policy "admin deletes post images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'post-images' and public.is_admin());
