/* ==============================================================
   AUTH.JS — one login shared by your multi-link site and Task Studio.

   SETUP (once):
   1. Create a free project at https://supabase.com
   2. Project Settings → API → copy "Project URL" and "anon public" key
   3. Paste them below
   4. Run supabase/schema.sql in the Supabase SQL editor
   5. Include this file (after the Supabase CDN script) on every
      page that needs login: your multi-link pages, login.html,
      task-studio/index.html, task-studio/admin.html
   ============================================================== */

const SUPABASE_URL = "https://amvhlpdentyhujfxehhp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_yaRoUOJxI3NhiLkNRQsHqQ_qdRh8373";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Create a new account */
async function signUp(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

/** Log in an existing account */
async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** Log out */
async function signOut() {
  await supabaseClient.auth.signOut();
}

/** Returns the logged-in user, or null */
async function getCurrentUser() {
  const { data } = await supabaseClient.auth.getUser();
  return data?.user || null;
}

/** Returns true only for the admin account */
async function isAdmin() {
  const user = await getCurrentUser();
  if (!user) return false;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (error) return false;
  return !!data?.is_admin;
}

/** Put at the top of any page that requires being logged in */
async function requireLogin(redirectTo = "/login.html") {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = redirectTo + "?next=" + encodeURIComponent(window.location.pathname);
  }
  return user;
}

/** Put at the top of admin.html only */
async function requireAdmin(redirectTo = "/task-studio/index.html") {
  const user = await requireLogin();
  if (!user) return null;
  const admin = await isAdmin();
  if (!admin) {
    window.location.href = redirectTo;
    return null;
  }
  return user;
}

/** Calls your deployed Edge Function, which holds the real AI key */
async function callModel(prompt, images, model) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const token = sessionData?.session?.access_token;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/call-model`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ prompt, images, model }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

/** Calls the Gemini Edge Function — for real audio/video file understanding.
 *  Pass a storagePath (from uploadFile) instead of raw file data, so large
 *  files never have to travel through a single request body. */
async function callGemini(prompt, storagePath, mimeType) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const token = sessionData?.session?.access_token;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/call-gemini`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ prompt, storagePath, mimeType }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

/** Uploads a file straight to Supabase Storage (handles large files natively,
 *  no size ceiling from stuffing everything into one JSON request). Returns
 *  the storage path to pass into callGemini. */
async function uploadFile(file, onProgress) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not logged in.");

  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error } = await supabaseClient
    .storage
    .from("task-uploads")
    .upload(path, file, { upsert: true });

  if (error) throw error;
  return path;
}
