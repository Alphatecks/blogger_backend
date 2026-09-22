-- Kairos Summit Blogger Backend Schema
-- Run this in Supabase SQL Editor before using blog endpoints.

create extension if not exists pgcrypto;

create table if not exists public.bloggers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  avatar_url text,
  role text not null default 'blogger' check (role in ('blogger', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  slug text not null unique,
  excerpt text,
  content text not null,
  cover_image_url text,
  is_top_header boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.posts
add column if not exists is_top_header boolean not null default false;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_name text not null,
  author_email text,
  content text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.post_tags (
  post_id uuid not null references public.posts (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, tag_id)
);

create index if not exists idx_posts_author_id on public.posts (author_id);
create index if not exists idx_posts_status_created_at on public.posts (status, created_at desc);
create index if not exists idx_posts_slug on public.posts (slug);
create index if not exists idx_posts_top_header on public.posts (is_top_header, updated_at desc);
create index if not exists idx_comments_post_id on public.comments (post_id);
create index if not exists idx_comments_status on public.comments (status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bloggers_updated_at on public.bloggers;
create trigger trg_bloggers_updated_at
before update on public.bloggers
for each row
execute function public.set_updated_at();

drop trigger if exists trg_posts_updated_at on public.posts;
create trigger trg_posts_updated_at
before update on public.posts
for each row
execute function public.set_updated_at();

alter table public.bloggers enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.tags enable row level security;
alter table public.post_tags enable row level security;

drop policy if exists "bloggers read own profile" on public.bloggers;
create policy "bloggers read own profile"
on public.bloggers
for select
using (auth.uid() = user_id);

drop policy if exists "bloggers update own profile" on public.bloggers;
create policy "bloggers update own profile"
on public.bloggers
for update
using (auth.uid() = user_id);

drop policy if exists "posts public read published" on public.posts;
create policy "posts public read published"
on public.posts
for select
using (status = 'published' or auth.uid() = author_id);

drop policy if exists "posts create own" on public.posts;
create policy "posts create own"
on public.posts
for insert
with check (auth.uid() = author_id);

drop policy if exists "posts update own" on public.posts;
create policy "posts update own"
on public.posts
for update
using (auth.uid() = author_id);

drop policy if exists "posts delete own" on public.posts;
create policy "posts delete own"
on public.posts
for delete
using (auth.uid() = author_id);

drop policy if exists "comments public read approved" on public.comments;
create policy "comments public read approved"
on public.comments
for select
using (
  status = 'approved'
  or exists (
    select 1
    from public.posts p
    where p.id = comments.post_id
      and p.author_id = auth.uid()
  )
);

drop policy if exists "comments create" on public.comments;
create policy "comments create"
on public.comments
for insert
with check (true);

drop policy if exists "comments moderate post owner" on public.comments;
create policy "comments moderate post owner"
on public.comments
for update
using (
  exists (
    select 1
    from public.posts p
    where p.id = comments.post_id
      and p.author_id = auth.uid()
  )
);

drop policy if exists "tags public read" on public.tags;
create policy "tags public read"
on public.tags
for select
using (true);

drop policy if exists "post_tags public read" on public.post_tags;
create policy "post_tags public read"
on public.post_tags
for select
using (true);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null default 'remnants-reborn-2026',
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  occupation text not null,
  coming_from text not null,
  who_told_you text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_event_registrations_event_email
on public.event_registrations (event_slug, lower(email));

create index if not exists idx_event_registrations_created_at
on public.event_registrations (event_slug, created_at desc);

alter table public.event_registrations enable row level security;

-- Direct client access is denied. The Express API writes with the service role.

create table if not exists public.post_visits (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_post_visits_post_id on public.post_visits (post_id);
create index if not exists idx_post_visits_created_at on public.post_visits (created_at desc);

alter table public.post_visits enable row level security;

create or replace view public.post_visit_counts as
select
  post_id,
  count(*)::int as visits
from public.post_visits
group by post_id;

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  product_slug text not null,
  product_name text not null,
  colour text not null,
  size text,
  quantity integer not null check (quantity > 0 and quantity <= 20),
  unit_price_kobo integer not null check (unit_price_kobo > 0),
  amount_kobo integer not null check (amount_kobo > 0),
  currency text not null default 'NGN',
  full_name text not null,
  email text not null,
  phone text not null,
  delivery_address text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'abandoned')),
  paystack_access_code text,
  paystack_authorization_url text,
  paid_at timestamptz,
  paystack_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shop_orders_email on public.shop_orders (lower(email));
create index if not exists idx_shop_orders_status_created_at on public.shop_orders (status, created_at desc);
create index if not exists idx_shop_orders_reference on public.shop_orders (reference);

drop trigger if exists trg_shop_orders_updated_at on public.shop_orders;
create trigger trg_shop_orders_updated_at
before update on public.shop_orders
for each row
execute function public.set_updated_at();

alter table public.shop_orders enable row level security;

-- Direct client access is denied. The Express API writes with the service role.
