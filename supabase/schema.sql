-- ============================================================
-- TASK STUDIO — Supabase schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. One row per user, tracks admin status
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  is_admin boolean default false,
  created_at timestamp with time zone default now()
);

-- 2. Automatically create a profile row whenever someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, false);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Tasks — every tab in Task Studio is one row here
create table if not exists tasks (
  id text primary key,
  label text not null,
  input_type text not null,        -- 'audio' | 'image' | 'video'
  description text,
  prompt text not null,
  model text default 'claude-sonnet-4-6',
  sort_order int default 0
);

-- 4. Lock everything down with Row Level Security
alter table profiles enable row level security;
alter table tasks enable row level security;

-- Anyone logged in can read their own profile (to check is_admin)
create policy "read own profile" on profiles
  for select using (auth.uid() = id);

-- Anyone logged in can read the task list
create policy "read tasks if logged in" on tasks
  for select using (auth.role() = 'authenticated');

-- ONLY admins can add/edit/delete tasks
create policy "admins manage tasks" on tasks
  for all using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- 5. Seed your three starting tasks
insert into tasks (id, label, input_type, description, prompt, sort_order) values
('audio-transcription', 'Audio Transcription', 'audio',
 'Speak into your mic for a live transcript.',
 'Transcribe speech to text exactly as spoken. Do not summarize or correct grammar. Mark unclear audio as [inaudible]. Note speaker changes if detected.',
 1),
('map-rating', 'Map Rating', 'image',
 'Upload a map image to get it rated.',
 'You are rating a map image for quality. Score 1-10 on: accuracy, clarity/legibility, and completeness of labeling. Give one line of reasoning per criterion, then an overall score.',
 2),
('video-quality-eval', 'Video Quality Eval', 'video',
 'Upload a short video to evaluate visual quality.',
 'You are shown 3 frames sampled from a video (start, middle, end). Evaluate apparent visual quality, consistency across frames, and any obvious artifacts. Rate 1-10 and explain briefly. Note you are working from sampled stills, not full motion.',
 3)
on conflict (id) do nothing;

-- ============================================================
-- LAST STEP (do this manually, only once, only for yourself):
-- Find your user id in Authentication → Users, then run:
--
--   update profiles set is_admin = true where email = 'YOUR_EMAIL_HERE';
--
-- This is the ONLY way anyone becomes admin — there is no
-- button in the app for it, on purpose.
-- ============================================================
