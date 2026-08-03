// ==============================================================
// call-gemini — Supabase Edge Function
//
// Handles AUDIO and VIDEO tasks with real, full-length files.
//
// How large files work here:
//   1. The browser uploads the file straight to Supabase Storage
//      (handles big files natively, no request-body ceiling).
//   2. This function downloads it server-side, then uploads it to
//      Gemini's own Files API (supports files up to ~2GB).
//   3. Once Gemini finishes processing it, we ask it to run your
//      task's prompt against the file.
//
// SETUP:
//   1. Get a free Gemini key: https://aistudio.google.com/app/apikey
//   2. Get your Supabase "service_role" secret key (Project Settings
//      → API Keys → Legacy API Keys tab, or the new secret key —
//      NEVER put this one in any browser-facing file, only here)
//   3. Deploy:  supabase functions deploy call-gemini
//   4. Set secrets:
//        supabase secrets set GEMINI_API_KEY=your_gemini_key
//        supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
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

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prompt, storagePath, mimeType } = await req.json();
    if (!storagePath) throw new Error("No file path was sent.");

    // 1. Pull the file down from Supabase Storage
    const { data: fileBlob, error: dlError } = await supabaseAdmin
      .storage
      .from("task-uploads")
      .download(storagePath);
    if (dlError) throw new Error("Couldn't read uploaded file: " + dlError.message);

    const fileBuffer = new Uint8Array(await fileBlob.arrayBuffer());

    // 2. Start a resumable upload to Gemini's Files API
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

    // 3. Send the actual bytes
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

    // 4. Wait until Gemini finishes processing the file
    let attempts = 0;
    while (fileInfo.state === "PROCESSING" && attempts < 30) {
      await sleep(2000);
      const checkRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileInfo.name}?key=${GEMINI_API_KEY}`
      );
      fileInfo = await checkRes.json();
      attempts++;
    }
    if (fileInfo.state !== "ACTIVE") {
      throw new Error("Gemini is still processing this file — try again in a moment.");
    }

    // 5. Clean up the copy in our own storage now that Gemini has it
    supabaseAdmin.storage.from("task-uploads").remove([storagePath]).catch(() => {});

    // 6. Ask Gemini to run the task's prompt against the file
    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { file_data: { mime_type: fileInfo.mimeType, file_uri: fileInfo.uri } },
                { text: prompt },
              ],
            },
          ],
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
