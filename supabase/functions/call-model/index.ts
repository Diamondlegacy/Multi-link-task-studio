// ==============================================================
// call-model — Supabase Edge Function
//
// This is the ONLY place your real Anthropic API key lives.
// The browser never sees it — it calls this function instead,
// and this function calls Anthropic on its behalf.
//
// DEPLOY (from your project folder, once you have the Supabase CLI):
//   supabase functions deploy call-model
//   supabase secrets set ANTHROPIC_API_KEY=your_real_key_here
// ==============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

serve(async (req) => {
  // Allow browser calls from your site
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prompt, images, model } = await req.json();

    const content = [];
    if (images && images.length) {
      for (const b64 of images) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: b64 },
        });
      }
    }
    content.push({ type: "text", text: prompt });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || "claude-sonnet-4-6",
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
