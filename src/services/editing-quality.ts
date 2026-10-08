import type { EditingAnalysis } from "@/types"

// ─── Editing quality (Gemini video understanding) ────────────────────────────
// Gemini reads a public YouTube URL directly — the official way to "watch" a
// video, nothing is downloaded. Two views of the same upload go in one request:
//   1. overview — first 10 min, one frame every 15 s, with the audio track
//   2. hook     — first 60 s, one frame per second (pacing and the opening)
// The model rates five rubric dimensions on discrete 1–5 levels (more reliable
// than asking for a raw number) and the 0-100 score is computed here.

// Pro separated well and poorly edited anchor videos with the widest margin and the
// most repeatable scores (Oct 2026 test); Flash is cheaper and also usable.
export const EDITING_QUALITY_MODEL = process.env.GEMINI_VIDEO_MODEL?.trim() || "gemini-3.1-pro-preview"
// Used when the primary model is overloaded (503), rate-limited (429) or retired (404).
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-3.8-flash"

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"
const OVERVIEW_MAX_SEC = 600
const OVERVIEW_FPS = 1 / 15
const HOOK_SEC = 60
const REQUEST_TIMEOUT_MS = 120_000
const RETRY_DELAY_MS = 3_000

// Narration–visual match weighs most: visuals that show what is being said are
// the clearest sign of deliberate editing.
const DIMENSION_WEIGHTS = {
  narration_visual_match: 0.35,
  visual_variety: 0.2,
  pacing: 0.2,
  hook: 0.1,
  technical_quality: 0.15,
} as const

type DimensionKey = keyof typeof DIMENSION_WEIGHTS
const DIMENSION_KEYS = Object.keys(DIMENSION_WEIGHTS) as DimensionKey[]

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY
}

/** Most recent upload worth reviewing: not a Short, not a long livestream VOD. */
export function pickEditingVideo<T extends { id: string; durationSec: number }>(videos: T[]): T | null {
  return videos.find((v) => v.durationSec > 60 && v.durationSec <= 3600) ?? null
}

export function editingQualityFromLevels(levels: Record<DimensionKey, number>): number {
  let score = 0
  for (const key of DIMENSION_KEYS) score += DIMENSION_WEIGHTS[key] * ((levels[key] - 1) / 4) * 100
  return Math.round(score)
}

function buildPrompt(hookClip: boolean): string {
  return `You are a senior YouTube video editor reviewing a creator's latest upload. Judge how well the video is EDITED — not how good the topic or the creator is.

You receive the same video ${hookClip ? "twice" : "once"}:
- Video 1 (overview): up to the first 10 minutes, one frame every 15 seconds, with the audio track. Frames are sparse, so do NOT infer cut frequency from them; use them to judge whether the visuals match what is being said, visual variety and technical quality.
${hookClip
    ? "- Video 2 (hook): the first 60 seconds, one frame per second, with audio. Use it to judge pacing (static stretches, dead air, cut rhythm) and the opening."
    : "- No dense clip is available: judge pacing and the hook cautiously from the overview and the audio, and say so in the evidence."}

Rate each dimension on a 1–5 level, against the norms of the video's format (a talking-head video can be well edited with captions, punch-ins and inserted visuals; a voiceover video should show footage that illustrates the narration):

1. narration_visual_match — do visuals ADDED IN EDITING (b-roll, cutaways, graphics, on-screen text, inserted footage) illustrate what is being said at that moment? Footage that simply records the scene as it happened is not an editing contribution, however well it matches the speech.
   1 = nothing added: a single unedited take, or one static shot while many topics are discussed
   3 = some added visuals, generic or loosely related; they match only part of the time
   5 = added visuals consistently and specifically illustrate the narration (relevant b-roll, graphics, text callouts)
2. visual_variety — b-roll, graphics, on-screen text, zooms/reframes, used with purpose
   1 = a single unchanging shot   3 = some variety but repetitive   5 = rich, purposeful variety
3. pacing — 1 = long static stretches, pauses and filler left in   3 = acceptable but uneven   5 = tight, deliberate rhythm
4. hook — the first 30–60 seconds   1 = slow intro, no reason to keep watching   3 = clear but plain opening   5 = strong edited cold open or preview
5. technical_quality — image clarity, lighting/color consistency, audio clarity, voice/music balance
   1 = poor   3 = acceptable   5 = professional

If the video has no speech (music only, gameplay without commentary), judge narration_visual_match by how well the edited sequence of shots carries the topic, and say so in the evidence.
Judge only what the edit adds. Do not reward the creator's fame, budget or the topic, and use the whole scale: editing that meets every level-5 description earns 5, and an unedited recording belongs at level 1–2 on narration_visual_match, visual_variety, pacing and hook.

Return ONLY valid JSON in exactly this shape:
{
  "format": "talking_head | voiceover_broll | screen_recording | animation | gameplay | mixed | other",
  "narration_visual_match": { "level": 1, "evidence": "max 200 chars, cite mm:ss timestamps" },
  "visual_variety": { "level": 1, "evidence": "..." },
  "pacing": { "level": 1, "evidence": "..." },
  "hook": { "level": 1, "evidence": "..." },
  "technical_quality": { "level": 1, "evidence": "..." },
  "summary": "2-3 sentences: how the editing serves the content and whether this creator would visibly benefit from a professional editor",
  "improvements": ["up to 3 specific, concrete changes an editor would make"]
}`
}

/** Validates the model's JSON; any missing or out-of-range level rejects the review. */
export function parseEditingResponse(raw: string, videoId: string, model: string): EditingAnalysis | null {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw)
  } catch {
    return null
  }

  const levels = {} as Record<DimensionKey, number>
  const dimensions = {} as EditingAnalysis["dimensions"]
  for (const key of DIMENSION_KEYS) {
    const d = parsed[key] as { level?: unknown; evidence?: unknown } | undefined
    const level = Math.round(Number(d?.level))
    if (!(level >= 1 && level <= 5)) return null
    levels[key] = level
    dimensions[key] = { level, evidence: String(d?.evidence ?? "").slice(0, 300) }
  }

  return {
    video_id: videoId,
    model,
    analyzed_at: new Date().toISOString(),
    editing_quality: editingQualityFromLevels(levels),
    format: String(parsed.format ?? "other").slice(0, 40),
    dimensions,
    summary: String(parsed.summary ?? "").slice(0, 600),
    improvements: Array.isArray(parsed.improvements)
      ? parsed.improvements.map((s) => String(s).slice(0, 200)).filter(Boolean).slice(0, 3)
      : [],
  }
}

/** A transient answer (429, 5xx) gets one retry after a short pause, then one try on the
 *  fallback model; an unknown model name (404) goes straight to the fallback. */
async function requestReview(apiKey: string, body: string): Promise<{ res: Response; model: string }> {
  let res: Response | undefined
  let model = EDITING_QUALITY_MODEL
  for (const candidate of [EDITING_QUALITY_MODEL, EDITING_QUALITY_MODEL, FALLBACK_MODEL]) {
    if (res) {
      if (res.status === 404 && candidate === model) continue
      console.warn(`[editing-quality] Gemini ${res.status} on ${model}; retrying on ${candidate}`)
      await res.body?.cancel()
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
    model = candidate
    res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (res.status !== 404 && res.status !== 429 && res.status < 500) break
  }
  return { res: res!, model }
}

/** Returns null when Gemini is not configured or the review fails — callers treat that as "not analyzed". */
export async function analyzeEditingQuality(video: { id: string; durationSec: number }): Promise<EditingAnalysis | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  const duration = Math.floor(video.durationSec)
  const videoPart = (endSec: number, fps: number) => ({
    file_data: { file_uri: `https://www.youtube.com/watch?v=${video.id}`, mime_type: "video/*" },
    video_metadata: { start_offset: "0s", end_offset: `${endSec}s`, fps },
    // 280 instead of 70 tokens per frame: framing, focus and on-screen text stay readable
    media_resolution: { level: "MEDIA_RESOLUTION_HIGH" },
  })
  const overview = videoPart(Math.min(duration, OVERVIEW_MAX_SEC), OVERVIEW_FPS)
  const hook = videoPart(Math.min(duration, HOOK_SEC), 1)

  // If the API rejects two views of the same video, retry once with the overview alone.
  for (const parts of [[overview, hook], [overview]]) {
    const hookClip = parts.length === 2
    try {
      const { res, model } = await requestReview(apiKey, JSON.stringify({
        contents: [{ parts: [...parts, { text: buildPrompt(hookClip) }] }],
        // Gemini 3 models are meant to run at their default temperature (1.0); lower
        // values can degrade their reasoning.
        generation_config: { response_mime_type: "application/json", thinking_config: { thinking_level: "HIGH" } },
      }))

      if (!res.ok) {
        console.warn(`[editing-quality] Gemini ${res.status} for ${video.id}:`, (await res.text()).slice(0, 300))
        if (res.status === 400 && hookClip) continue
        return null
      }

      const data = await res.json()
      const raw = ((data.candidates?.[0]?.content?.parts ?? []) as { text?: string; thought?: boolean }[])
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join("")
      const analysis = parseEditingResponse(raw, video.id, model)
      if (!analysis) console.warn(`[editing-quality] Unusable response for ${video.id}:`, raw.slice(0, 200))
      return analysis
    } catch (err) {
      console.warn(`[editing-quality] Request failed for ${video.id}:`, err instanceof Error ? err.message : err)
      return null
    }
  }
  return null
}
