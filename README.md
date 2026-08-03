# Task Studio — Setup Guide

This turns on: one shared login for your multi-link site + Task Studio, you as
the only admin, and a way to add new task tabs without writing new code.

Nothing here runs yet — it needs to be connected to a free backend service
(Supabase) and dropped into your real website's files. Follow these steps in
order.

## 1. Create your backend (5 minutes, free)
1. Go to https://supabase.com → sign up → "New project"
2. Once it's created, go to **Project Settings → API**
3. Copy the **Project URL** and the **anon public** key

## 2. Set up the database
1. In Supabase, go to **SQL Editor → New query**
2. Open `supabase/schema.sql` from this folder, paste its full contents in, and run it
3. This creates your `profiles` and `tasks` tables, auto-signup handling, security
   rules, and seeds your 3 starting tasks

## 3. Connect the code to your backend
1. Open `shared/auth.js`
2. Replace `YOUR_SUPABASE_PROJECT_URL` and `YOUR_SUPABASE_ANON_KEY` with the
   values from Step 1

## 4. Make yourself the admin
1. Sign up for an account through `login.html` (once it's live) using your real email
2. In Supabase, go to **Table Editor → profiles**, find your row
3. Change its `is_admin` value to `true`
   (This is the only way to become admin — there's no button for it anywhere
   in the app, on purpose.)

## 5. Deploy the AI proxies (so your API keys stay private)
Your Task Studio tabs need to call AI models, but a plain HTML site can't
safely hold secret API keys — anyone could view them in the page source.
There are two proxy functions: one for Claude (Map Rating), one for Gemini
(Audio Transcription and Video Quality Eval).

Large audio/video files now go: **browser → Supabase Storage → Edge
Function → Gemini's own large-file system** — so there's no small size
ceiling like before (Gemini supports files up to ~2GB this way).

1. Install the Supabase CLI: https://supabase.com/docs/guides/cli
2. Get a free Gemini API key at https://aistudio.google.com/app/apikey
3. Get your **service_role** secret key: Project Settings → API Keys →
   Legacy API Keys tab (or the equivalent "secret key" in the new key
   system). **This key is powerful — never put it in any browser-facing
   file, only set it as a function secret as shown below.**
4. From this project folder, run:
   ```
   supabase functions deploy call-model
   supabase functions deploy call-gemini
   supabase secrets set ANTHROPIC_API_KEY=your_real_anthropic_key
   supabase secrets set GEMINI_API_KEY=your_real_gemini_key
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```
5. Make sure you've run the latest `supabase/schema.sql` (Step 2) — it now
   also creates the private `task-uploads` storage bucket these functions
   need. If you already ran an older version, just re-run the whole file
   again; every statement is safe to run more than once.

### If you already had the old version running
Your `tasks` table already has a Video Quality Eval prompt written for the
old "3 sampled frames" approach. Update it to match real video understanding
by running this in Supabase's SQL Editor:
```sql
update tasks
set prompt = 'Evaluate this video''s visual quality: sharpness, motion smoothness, lighting, and any artifacts or glitches. Note if audio is present and its clarity. Rate 1-10 and explain your reasoning in 2-3 sentences.'
where id = 'video-quality-eval';
```
(Or just edit it by hand in the Admin page — same result.)

## 6. Drop the files into your real site
Copy these into your actual website's folder, alongside your existing pages:
```
login.html
shared/
task-studio/
```
Your existing pages (like your multi-link homepage) don't need to move —
just make sure they include `shared/auth.js` too, so the same login works
there.

## 7. Match your real brand
Open `shared/brand.css` and swap the color/font values at the top to your
multi-link site's actual palette. Every page pulls from these variables, so
one edit updates everything.

## Adding a new task later
No code needed. Log in as admin, go to Task Studio → **Admin**, fill in the
"Add a new task" form (id, label, input type, description, prompt), and it
appears as a live tab immediately for every user.

## What each piece does
| File | Purpose |
|---|---|
| `login.html` | Shared sign in / sign up, used by your whole site |
| `shared/auth.js` | Talks to Supabase: login state, admin check, AI calls |
| `shared/brand.css` | Your site's colors/fonts, in one place |
| `task-studio/index.html` | What every user sees — tabs built from your tasks table |
| `task-studio/admin.html` | Prompt editor + add/delete tasks — admin-only |
| `task-studio/tasks.js` | (Optional reference) the original seed task list |
| `supabase/schema.sql` | Database setup — run once |
| `supabase/functions/call-model` | Keeps your Claude key private — used for Map Rating (image) |
| `supabase/functions/call-gemini` | Keeps your Gemini key private — used for Audio Transcription and Video Quality Eval (real files, not sampled frames) |
