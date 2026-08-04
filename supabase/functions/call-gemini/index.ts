import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.e// ==============================================================
// call-gemini — Supabase Edge Function
//
// Runs as a BACKGROUND JOB now, not a live wait-and-hope request:
//   1. Creates a "jobs" row and responds immediately with its id
//      (so the connection never has time to die on slow files)
//   2. Keeps working in the background after responding
//   3. Writes the result into that same jobs row when finished
//   4. The browser polls the jobs table directly until it's done
// ==============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MODEL = "gemini-2.5-flash";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadOneFile(storagePath) {
  const { data: fileBlob, error: dlError } = await supabaseAdmin
    .storage
    .from("task-uploads")
    .download(storagePath);
  if (dlError) throw new Error("Couldn't read uploaded file: " + dlError.message);

  const fileBuffer = new Uint8Array(await fileBlob.arrayBuffer());
  const mimeType = fileBlob.type || "application/octet-stream";

  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(fileBuffer.byteLength),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: storagePath } }),
    }
  );
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini didn't return an upload URL.");

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(fileBuffer.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: fileBuffer,
  });
  const uploadedFile = await uploadRes.json();
  if (uploadedFile.error) throw new Error(uploadedFile.error.message);

  let fileInfo = uploadedFile.file;
  let attempts = 0;
  while (fileInfo.state === "PROCESSING" && attempts < 40) {
    await sleep(1500);
    const checkRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileInfo.name}?key=${GEMINI_API_KEY}`
    );
    fileInfo = await checkRes.json();
    attempts++;
  }
  if (fileInfo.state !== "ACTIVE") {
    throw new Error("Gemini is still processing " + storagePath + " — try again shortly.");
  }

  supabaseAdmin.storage.from("task-uploads").remove([storagePath]).catch(() => {});
  return { file_data: { mime_type: fileInfo.mimeType, file_uri: fileInfo.uri } };
}

async function processJob(jobId, storagePaths, prompt) {
  try {
    await supabaseAdmin.from("jobs").update({ status: "processing" }).eq("id", jobId);

    const fileParts = await Promise.all(storagePaths.map(uploadOneFile));

    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [...fileParts, { text: prompt }] }],
        }),
      }
    );
    const genData = await genRes.json();
    if (genData.error) throw new Error(genData.error.message);

    const text =
      genData.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") ||
      "(no response)";

    await supabaseAdmin.from("jobs").update({ status: "done", result: text }).eq("id", jobId);
  } catch (err) {
    await supabaseAdmin
      .from("jobs")
      .update({ status: "error", error: String(err.message || err) })
      .eq("id", jobId);
  }
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) throw new Error("Not logged in.");

    const { taskId, storagePaths } = await req.json();
    if (!taskId) throw new Error("No task specified.");
    if (!storagePaths || !storagePaths.length) throw new Error("No files were sent.");

    const { data: task, error: taskError } = await supabaseAdmin
      .from("tasks")
      .select("prompt")
      .eq("id", taskId)
      .single();
    if (taskError || !task) throw new Error("Unknown task.");

    const { data: job, error: jobError } = await supabaseAdmin
      .from("jobs")
      .insert({
        user_id: userData.user.id,
        task_id: taskId,
        storage_paths: storagePaths,
        status: "pending",
      })
      .select()
      .single();
    if (jobError) throw new Error(jobError.message);

    // Kick off the real work in the background. The response below
    // goes out immediately, so the connection never sits open long
    // enough to be cut — no more "Failed to fetch" on bigger jobs.
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil(processJob(job.id, storagePaths, task.prompt));

    return new Response(JSON.stringify({ jobId: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});nv.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MODEL = "gemini-2.5-flash";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadOneFile(storagePath) {
  const { data: fileBlob, error: dlError } = await supabaseAdmin
    .storage
    .from("task-uploads")
    .download(storagePath);
  if (dlError) throw new Error("Couldn't read uploaded file: " + dlError.message);

  const fileBuffer = new Uint8Array(await fileBlob.arrayBuffer());
  const mimeType = fileBlob.type || "application/octet-stream";

  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(fileBuffer.byteLength),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: storagePath } }),
    }
  );
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini didn't return an upload URL.");

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(fileBuffer.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: fileBuffer,
  });
  const uploadedFile = await uploadRes.json();
  if (uploadedFile.error) throw new Error(uploadedFile.error.message);

  let fileInfo = uploadedFile.file;
  let attempts = 0;
  while (fileInfo.state === "PROCESSING" && attempts < 20) {
    await sleep(1500);
    const checkRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileInfo.name}?key=${GEMINI_API_KEY}`
    );
    fileInfo = await checkRes.json();
    attempts++;
  }
  if (fileInfo.state !== "ACTIVE") {
    throw new Error("Gemini is still processing " + storagePath + " — try again shortly.");
  }

  supabaseAdmin.storage.from("task-uploads").remove([storagePath]).catch(() => {});
  return { file_data: { mime_type: fileInfo.mimeType, file_uri: fileInfo.uri } };
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { taskId, storagePaths } = await req.json();
    if (!taskId) throw new Error("No task specified.");
    if (!storagePaths || !storagePaths.length) throw new Error("No files were sent.");

    const { data: task, error: taskError } = await supabaseAdmin
      .from("tasks")
      .select("prompt")
      .eq("id", taskId)
      .single();
    if (taskError || !task) throw new Error("Unknown task.");

    // All files are processed at the same time, not one-by-one —
    // this is what stops 3+ files from timing out.
    const fileParts = await Promise.all(storagePaths.map(uploadOneFile));

    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [...fileParts, { text: task.prompt }] }],
        }),
      }
    );
    const genData = await genRes.json();
    if (genData.error) throw new Error(genData.error.message);

    const text =
      genData.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") ||
      "(no response)";

    return new Response(JSON.stringify({ result: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
