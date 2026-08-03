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

## 5. Deploy the AI proxy (so your API key stays private)
Your Task Studio tabs need to call an AI model, but a plain HTML site can't
safely hold a secret API key — anyone could view it in the page source. The
fix is `supabase/functions/call-model`, a small piece of code that lives on
Supabase's servers instead of the browser.
1. Install the Supabase CLI: https://supabase.com/docs/guides/cli
2. From this project folder, run:
   ```
   supabase functions deploy call-model
   supabase secrets set ANTHROPIC_API_KEY=your_real_anthropic_key
   ```
3. That's it — the browser never sees your real key, only this function does

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
| `supabase/functions/call-model` | Keeps your AI key private, off the browser |
