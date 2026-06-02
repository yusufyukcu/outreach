import { getVideoThumbnailUrl } from "./youtube"

export interface ThumbnailQualityResult {
  score: number             // 0-100
  needs_improvement: boolean
  signal: string            // e.g. "Inconsistent design, low contrast text, amateur layout"
}

export async function analyzeThumbnails(
  channelName: string,
  serviceType: string,
  videoIds: string[]        // use first 4 video IDs
): Promise<ThumbnailQualityResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || videoIds.length === 0) {
    return { score: 50, needs_improvement: false, signal: "Analysis unavailable" }
  }

  const ids = videoIds.slice(0, 4)
  const thumbnailUrls = ids.map((id) => getVideoThumbnailUrl(id))

  const imageContent = thumbnailUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url, detail: "low" as const },
  }))

  const textContent = {
    type: "text" as const,
    text: `You are evaluating YouTube thumbnails for an agency that sells ${serviceType} services. Analyze these ${ids.length} thumbnails from channel "${channelName}".

Rate their quality 0-100 (0=very amateur/inconsistent, 100=highly professional).
Consider: visual consistency, text readability, color use, layout, click-worthiness.
A LOW score means HIGH opportunity for improvement (better lead for our agency).

Return ONLY valid JSON:
{ "score": number_0_to_100, "needs_improvement": boolean, "signal": "brief description max 80 chars" }`,
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
        messages: [
          {
            role: "user",
            content: [textContent, ...imageContent],
          },
        ],
        temperature: 0.2,
        max_tokens: 150,
        response_format: { type: "json_object" },
      }),
    })

    if (!res.ok) return { score: 50, needs_improvement: false, signal: "Analysis failed" }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return { score: 50, needs_improvement: false, signal: "No response" }

    const parsed = JSON.parse(content)
    const score = Math.max(0, Math.min(100, Number(parsed.score ?? 50)))
    return {
      score,
      needs_improvement: Boolean(parsed.needs_improvement ?? score < 60),
      signal: String(parsed.signal ?? ""),
    }
  } catch {
    return { score: 50, needs_improvement: false, signal: "Analysis failed" }
  }
}
