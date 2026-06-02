import { getVideoThumbnailUrl } from "./youtube"

export interface ThumbnailQualityResult {
  score: number             // 0-100
  needs_improvement: boolean
  signal: string
  // Faceless vision detection
  face_detected: boolean    // true = consistent human face across thumbnails
  face_confidence: number   // 0-100
  face_signal: string       // e.g. "Same person appears in 5/6 thumbnails"
}

export async function analyzeThumbnails(
  channelName: string,
  serviceType: string,
  videoIds: string[]
): Promise<ThumbnailQualityResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || videoIds.length === 0) {
    return { score: 50, needs_improvement: false, signal: "Analysis unavailable", face_detected: false, face_confidence: 0, face_signal: "No thumbnails available" }
  }

  const ids = videoIds.slice(0, 6)
  const thumbnailUrls = ids.map((id) => getVideoThumbnailUrl(id))

  const imageContent = thumbnailUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url, detail: "low" as const },
  }))

  const textContent = {
    type: "text" as const,
    text: `You are analyzing ${ids.length} YouTube thumbnails from the channel "${channelName}" for a ${serviceType} agency.

Answer TWO things:

1. THUMBNAIL QUALITY: Rate 0-100 (0=very amateur, 100=highly professional). Consider consistency, text readability, color, layout. LOW score = high opportunity for improvement.

2. FACE DETECTION: Does the SAME human face (the creator) appear consistently across most thumbnails?
   - face_detected = true ONLY if a real human face clearly appears in the MAJORITY (>50%) of thumbnails
   - face_detected = false for: stock footage, AI imagery, text-only, graphics, landscapes, objects, or when no clear person is shown
   - face_confidence = how certain you are (0-100)
   - face_signal = brief note like "Creator's face appears in 5/6 thumbnails" or "No human face detected — stock footage style"

Return ONLY valid JSON:
{
  "score": number,
  "needs_improvement": boolean,
  "signal": "max 80 chars",
  "face_detected": boolean,
  "face_confidence": number,
  "face_signal": "max 80 chars"
}`,
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: [textContent, ...imageContent] }],
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    })

    if (!res.ok) return { score: 50, needs_improvement: false, signal: "Analysis failed", face_detected: false, face_confidence: 0, face_signal: "Analysis failed" }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return { score: 50, needs_improvement: false, signal: "No response", face_detected: false, face_confidence: 0, face_signal: "No response" }

    const parsed = JSON.parse(content)
    const score = Math.max(0, Math.min(100, Number(parsed.score ?? 50)))
    const faceConf = Math.max(0, Math.min(100, Number(parsed.face_confidence ?? 0)))

    return {
      score,
      needs_improvement: Boolean(parsed.needs_improvement ?? score < 60),
      signal: String(parsed.signal ?? ""),
      face_detected: Boolean(parsed.face_detected ?? false),
      face_confidence: faceConf,
      face_signal: String(parsed.face_signal ?? ""),
    }
  } catch {
    return { score: 50, needs_improvement: false, signal: "Analysis failed", face_detected: false, face_confidence: 0, face_signal: "Analysis failed" }
  }
}
