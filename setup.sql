-- Microblog database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then Run.
-- Safe to run more than once.

-- ---------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------

-- Who is allowed to publish. Add your user to this table (see README).
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  content      text not null,
  status       text not null default 'draft'
               check (status in ('draft', 'published', 'unpublished')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists posts_feed_idx
  on public.posts (published_at desc)
  where status = 'published';

-- One row only (id is always 1): the profile shown on the feed.
create table if not exists public.settings (
  id           int primary key default 1 check (id = 1),
  display_name text not null default 'Anubhav',
  avatar_url   text,
  name_color   text not null default '#FFB800',
  page_title   text not null default 'Thoughts | Anubhav'
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- 2. Helper: is the current user the admin?
-- ---------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------
-- 3. Automatic timestamps
-- ---------------------------------------------------------------

create or replace function public.posts_before_write()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- First time a post becomes published, stamp the publish date.
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists posts_before_write on public.posts;
create trigger posts_before_write
  before insert or update on public.posts
  for each row execute function public.posts_before_write();

-- ---------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------

alter table public.admin_users enable row level security;  -- no policies: nobody can read it directly
alter table public.posts       enable row level security;
alter table public.settings    enable row level security;

-- posts: visitors read published only
drop policy if exists "public reads published posts" on public.posts;
create policy "public reads published posts"
  on public.posts for select
  using (status = 'published');

-- posts: admin can do everything
drop policy if exists "admin reads all posts" on public.posts;
create policy "admin reads all posts"
  on public.posts for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admin inserts posts" on public.posts;
create policy "admin inserts posts"
  on public.posts for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admin updates posts" on public.posts;
create policy "admin updates posts"
  on public.posts for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin deletes posts" on public.posts;
create policy "admin deletes posts"
  on public.posts for delete
  to authenticated
  using (public.is_admin());

-- settings: everyone reads, admin writes
drop policy if exists "public reads settings" on public.settings;
create policy "public reads settings"
  on public.settings for select
  using (true);

drop policy if exists "admin inserts settings" on public.settings;
create policy "admin inserts settings"
  on public.settings for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admin updates settings" on public.settings;
create policy "admin updates settings"
  on public.settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------
-- 5. Avatar storage
-- ---------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "public reads avatars" on storage.objects;
create policy "public reads avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "admin uploads avatars" on storage.objects;
create policy "admin uploads avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and public.is_admin());

drop policy if exists "admin updates avatars" on storage.objects;
create policy "admin updates avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and public.is_admin());

drop policy if exists "admin deletes avatars" on storage.objects;
create policy "admin deletes avatars"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and public.is_admin());

-- ---------------------------------------------------------------
-- 6. Make yourself the admin (run AFTER creating your user in
--    Supabase > Authentication > Users). Replace the email, then
--    run this one statement on its own:
-- ---------------------------------------------------------------
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'you@example.com';
