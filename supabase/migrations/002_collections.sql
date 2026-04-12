-- Collections — named groups of saved community posts
create table public.collections (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  description text,
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.collections enable row level security;
create policy "Users can view own collections" on public.collections for select using (auth.uid() = user_id);
create policy "Public collections are viewable" on public.collections for select using (is_public = true);
create policy "Users can create own collections" on public.collections for insert with check (auth.uid() = user_id);
create policy "Users can update own collections" on public.collections for update using (auth.uid() = user_id);
create policy "Users can delete own collections" on public.collections for delete using (auth.uid() = user_id);

-- Collection items — posts in a collection
create table public.collection_items (
  id uuid default uuid_generate_v4() primary key,
  collection_id uuid references public.collections on delete cascade not null,
  post_id uuid references public.community_posts on delete cascade not null,
  added_at timestamptz default now(),
  unique(collection_id, post_id)
);

alter table public.collection_items enable row level security;
create policy "Collection items visible if collection is" on public.collection_items
  for select using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id
      and (c.user_id = auth.uid() or c.is_public = true)
    )
  );
create policy "Users can add to own collections" on public.collection_items
  for insert with check (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid())
  );
create policy "Users can remove from own collections" on public.collection_items
  for delete using (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid())
  );
