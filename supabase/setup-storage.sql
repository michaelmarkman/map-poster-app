-- Run in Supabase SQL Editor
insert into storage.buckets (id, name, public) values ('renders', 'renders', true);
insert into storage.buckets (id, name, public) values ('thumbnails', 'thumbnails', true);
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

-- Storage policies
create policy "Anyone can view renders" on storage.objects for select using (bucket_id = 'renders');
create policy "Authenticated users can upload renders" on storage.objects for insert with check (bucket_id = 'renders' and auth.role() = 'authenticated');
create policy "Users can delete own renders" on storage.objects for delete using (bucket_id = 'renders' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Anyone can view thumbnails" on storage.objects for select using (bucket_id = 'thumbnails');
create policy "Authenticated users can upload thumbnails" on storage.objects for insert with check (bucket_id = 'thumbnails' and auth.role() = 'authenticated');

create policy "Anyone can view avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "Authenticated users can upload avatars" on storage.objects for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
create policy "Users can update own avatar" on storage.objects for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
