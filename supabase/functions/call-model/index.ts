// ==============================================================
// call-model — Supabase Edge Function
//
// This is the ONLY place your real Anthropic API key lives.
// The browser never sees it, and never sees the prompt either —
// it sends a taskId, and this function looks the real prompt up
// server-side, admin or not.
//
// DEPLOY (from your project folder, once you have the Supabase CLI):
//   supabase functions deploy call-model
//   supabase secrets set ANTHROPIC_API_KEY=your_real_key_here
// ==============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { taskId, images } = await req.json();
    if (!taskId) throw new Error("No task specified.");

    const { data: task, error: taskError } = await supabaseAdmin
      .from("tasks")
      .select("prompt, model")
      .eq("id", taskId)
      .single();
    if (taskError || !task) throw new Error("Unknown task.");

    const content = [];
    if (images && images.length) {
      for (const b64 of images) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: b64 },
        });
      }
    }
    content.push({ type: "text", text: task.prompt });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: task.model || "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content }],
      }),
    });

    const data = await response.json();
    const text = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    return new Response(JSON.stringify({ result: text || "(no response)" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
