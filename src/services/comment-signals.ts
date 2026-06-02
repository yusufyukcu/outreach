export interface CommentSignalResult {
  needs_help: boolean       // true if comments suggest creator needs editing/thumbnail help
  signal: string            // human-readable summary
  score: number             // 0-100, how strongly comments indicate need for services
}

export async function analyzeCommentSignals(
  channelName: string,
  serviceType: string,
  comments: string[]
): Promise<CommentSignalResult> {
  if (comments.length === 0) {
    return { needs_help: false, signal: "No comments available", score: 0 }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { needs_help: false, signal: "OpenAI not configured", score: 0 }
  }

  const commentSample = comments.slice(0, 25).join("\n")

  const prompt = `You are analyzing YouTube comments for the channel "${channelName}" to help a ${serviceType} agency identify if the creator needs help.

Analyze these comments for signals that the creator needs help:
NEGATIVE signals (opportunity): "upload more", "the editing has gotten worse", "bad thumbnails", "you should post more often", "where have you been", "I miss your old videos", "please come back", complaints about quality decline, requests for more frequent uploads.
POSITIVE signals (already professional): "the editing is so good", "love the new thumbnails", "production quality is amazing", "best editing on YouTube"

Comments:
${commentSample}

Return ONLY valid JSON with this exact structure:
{ "needs_help": boolean, "signal": "brief human-readable summary max 80 chars", "score": number_0_to_100 }

score = how strongly the comments suggest the creator needs ${serviceType} services (0=no need, 100=strong need).`

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 150,
        response_format: { type: "json_object" },
      }),
    })

    if (!res.ok) return { needs_help: false, signal: "Analysis failed", score: 0 }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return { needs_help: false, signal: "No response", score: 0 }

    const parsed = JSON.parse(content)
    return {
      needs_help: Boolean(parsed.needs_help),
      signal: String(parsed.signal ?? ""),
      score: Math.max(0, Math.min(100, Number(parsed.score ?? 0))),
    }
  } catch {
    return { needs_help: false, signal: "Analysis failed", score: 0 }
  }
}
