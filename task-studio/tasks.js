/* ==============================================================
   This file is a REFERENCE ONLY — the live app actually reads
   tasks from your Supabase "tasks" table (so admin edits show
   up instantly without redeploying code).

   This just shows the shape of a task, matching supabase/schema.sql,
   so it's easy to see what "adding a task" means structurally.
   ============================================================== */

const EXAMPLE_TASKS = [
  {
    id: "audio-transcription",
    label: "Audio Transcription",
    input_type: "audio",              // 'audio' | 'image' | 'video'
    description: "Speak into your mic for a live transcript.",
    prompt: "Transcribe speech to text exactly as spoken. Do not summarize or correct grammar. Mark unclear audio as [inaudible]. Note speaker changes if detected.",
    model: "claude-sonnet-4-6",
    sort_order: 1
  },
  {
    id: "map-rating",
    label: "Map Rating",
    input_type: "image",
    description: "Upload a map image to get it rated.",
    prompt: "You are rating a map image for quality. Score 1-10 on: accuracy, clarity/legibility, and completeness of labeling. Give one line of reasoning per criterion, then an overall score.",
    model: "claude-sonnet-4-6",
    sort_order: 2
  },
  {
    id: "video-quality-eval",
    label: "Video Quality Eval",
    input_type: "video",
    description: "Upload a short video to evaluate visual quality.",
    prompt: "You are shown 3 frames sampled from a video (start, middle, end). Evaluate apparent visual quality, consistency across frames, and any obvious artifacts. Rate 1-10 and explain briefly. Note you are working from sampled stills, not full motion.",
    model: "claude-sonnet-4-6",
    sort_order: 3
  }
];
