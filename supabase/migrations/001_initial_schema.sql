-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users profile (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row Level Security
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Saved views (user's poster configurations)
create table public.saved_views (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  description text,
  -- Camera state
  latitude double precision not null,
  longitude double precision not null,
  altitude double precision not null,
  tilt double precision not null,
  heading double precision not null,
  focal_length double precision not null,
  -- Effects state
  time_of_day double precision not null,
  dof_on boolean default true,
  dof_tightness double precision default 70,
  blur_amount double precision default 25,
  clouds_on boolean default true,
  cloud_coverage double precision default 0.2,
  color_pop double precision default 60,
  bloom_on boolean default false,
  ssao_on boolean default false,
  vignette_on boolean default false,
  -- Style
  style_preset text,
  -- Thumbnail
  thumbnail_url text,
  -- Metadata
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.saved_views enable row level security;
create policy "Users can view own saved views" on public.saved_views for select using (auth.uid() = user_id);
create policy "Users can view public saved views" on public.saved_views for select using (is_public = true);
create policy "Users can insert own saved views" on public.saved_views for insert with check (auth.uid() = user_id);
create policy "Users can update own saved views" on public.saved_views for update using (auth.uid() = user_id);
create policy "Users can delete own saved views" on public.saved_views for delete using (auth.uid() = user_id);

-- Templates (curated starting views)
create table public.templates (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  category text, -- 'city', 'nature', 'landmark', 'aerial'
  -- Same camera/effects fields as saved_views
  latitude double precision not null,
  longitude double precision not null,
  altitude double precision not null,
  tilt double precision not null,
  heading double precision not null,
  focal_length double precision not null,
  time_of_day double precision not null,
  dof_on boolean default true,
  dof_tightness double precision default 70,
  blur_amount double precision default 25,
  clouds_on boolean default true,
  cloud_coverage double precision default 0.2,
  color_pop double precision default 60,
  style_preset text,
  thumbnail_url text,
  sort_order integer default 0,
  created_at timestamptz default now()
);

alter table public.templates enable row level security;
create policy "Templates are viewable by everyone" on public.templates for select using (true);

-- Community gallery (shared creations)
create table public.community_posts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  saved_view_id uuid references public.saved_views on delete set null,
  title text not null,
  description text,
  image_url text not null, -- high-res render stored in Supabase Storage
  thumbnail_url text,
  location_name text,
  -- Engagement
  likes_count integer default 0,
  saves_count integer default 0,
  -- Metadata
  created_at timestamptz default now()
);

alter table public.community_posts enable row level security;
create policy "Community posts are viewable by everyone" on public.community_posts for select using (true);
create policy "Users can create own posts" on public.community_posts for insert with check (auth.uid() = user_id);
create policy "Users can delete own posts" on public.community_posts for delete using (auth.uid() = user_id);

-- Likes
create table public.likes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  post_id uuid references public.community_posts on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, post_id)
);

alter table public.likes enable row level security;
create policy "Likes are viewable by everyone" on public.likes for select using (true);
create policy "Users can like posts" on public.likes for insert with check (auth.uid() = user_id);
create policy "Users can unlike" on public.likes for delete using (auth.uid() = user_id);

-- Saves (bookmarks)
create table public.saves (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  post_id uuid references public.community_posts on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, post_id)
);

alter table public.saves enable row level security;
create policy "Users can view own saves" on public.saves for select using (auth.uid() = user_id);
create policy "Users can save posts" on public.saves for insert with check (auth.uid() = user_id);
create policy "Users can unsave" on public.saves for delete using (auth.uid() = user_id);

-- Functions for like/save counts
create or replace function public.increment_likes()
returns trigger as $$
begin
  update public.community_posts set likes_count = likes_count + 1 where id = new.post_id;
  return new;
end;
$$ language plpgsql security definer;

create or replace function public.decrement_likes()
returns trigger as $$
begin
  update public.community_posts set likes_count = greatest(0, likes_count - 1) where id = old.post_id;
  return old;
end;
$$ language plpgsql security definer;

create trigger on_like_added after insert on public.likes for each row execute function public.increment_likes();
create trigger on_like_removed after delete on public.likes for each row execute function public.decrement_likes();

create or replace function public.increment_saves()
returns trigger as $$
begin
  update public.community_posts set saves_count = saves_count + 1 where id = new.post_id;
  return new;
end;
$$ language plpgsql security definer;

create or replace function public.decrement_saves()
returns trigger as $$
begin
  update public.community_posts set saves_count = greatest(0, saves_count - 1) where id = old.post_id;
  return old;
end;
$$ language plpgsql security definer;

create trigger on_save_added after insert on public.saves for each row execute function public.increment_saves();
create trigger on_save_removed after delete on public.saves for each row execute function public.decrement_saves();

-- Seed templates with great starting views
insert into public.templates (name, description, category, latitude, longitude, altitude, tilt, heading, focal_length, time_of_day, style_preset, sort_order) values
('Empire State Building', 'Classic NYC aerial with tilt-shift', 'landmark', 40.748440, -73.985664, 700, 60, 20, 35, 12, 'Realistic', 1),
('Golden Gate Bridge', 'San Francisco icon from above', 'landmark', 37.8199, -122.4783, 500, 55, 45, 50, 16, 'Golden Hour', 2),
('Central Park', 'Manhattan''s green heart', 'nature', 40.7829, -73.9654, 1200, 70, 0, 24, 14, 'Realistic', 3),
('Tokyo Tower', 'Shibuya crossing from above', 'city', 35.6586, 139.7454, 400, 50, 30, 35, 10, 'Night', 4),
('Eiffel Tower', 'Paris from the sky', 'landmark', 48.8584, 2.2945, 600, 55, 15, 35, 11, 'Vintage Postcard', 5),
('Venice Canals', 'Floating city aerial', 'city', 45.4408, 12.3155, 300, 65, 90, 50, 15, 'Polaroid', 6),
('Dubai Marina', 'Futuristic skyline', 'city', 25.0805, 55.1403, 800, 50, 60, 35, 17, 'Realistic', 7),
('Santorini', 'Greek island paradise', 'nature', 36.3932, 25.4615, 400, 60, 180, 50, 16, 'Golden Hour', 8),
('London Eye', 'Thames river view', 'landmark', 51.5033, -0.1196, 500, 55, 270, 35, 12, 'Realistic', 9),
('Colosseum', 'Ancient Rome from above', 'landmark', 41.8902, 12.4922, 350, 60, 45, 50, 15, 'Vintage Postcard', 10),
('Sydney Opera House', 'Harbour view', 'landmark', -33.8568, 151.2153, 500, 55, 120, 35, 10, 'Realistic', 11),
('Machu Picchu', 'Lost city in the clouds', 'nature', -13.1631, -72.5450, 600, 50, 0, 24, 8, '70s Film', 12);
