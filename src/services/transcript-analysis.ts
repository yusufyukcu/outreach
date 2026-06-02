export interface TranscriptAnalysisResult {
  is_faceless: boolean
  faceless_confidence: number  // 0-100
  faceless_signal: string      // e.g. "Creator speaks in first person: 'filming from my office'"
  editing_need_score: number   // 0-100, higher = more likely needs editing help
  editing_signals: string[]    // e.g. ["mentions editing struggles", "raw vlog style"]
}

export async function analyzeTranscript(
  channelName: string,
  serviceType: string,
  transcript: string
): Promise<TranscriptAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return {
      is_faceless: false,
      faceless_confidence: 0,
      faceless_signal: "OpenAI not configured",
      editing_need_score: 0,
      editing_signals: [],
    }
  }

  // Truncate to ~1500 chars
  const truncated = transcript.slice(0, 1500)

  const prompt = `You are analyzing a YouTube video transcript for the channel "${channelName}" to help a ${serviceType} agency.

Analyze this transcript for two things:
1. Is this a FACELESS channel (voiceover/stock footage, no creator on camera) or FACE-CAM (creator visibly on camera)?
   - Faceless signals: narration style ("in this video we'll explore"), documentary tone, no personal camera references
   - Face-cam signals: first-person camera language ("filming from my desk", "as you can see here", "I'm holding the camera"), vlog style, personal anecdotes about being on screen
2. How much does this creator NEED editing/production help?
   - High need: mentions struggling with editing, raw unpolished delivery, long pauses/filler words, mentions wanting to improve quality
   - Low need: polished scripted delivery, professional tone, mentions having a team

Transcript:
${truncated}

Return ONLY valid JSON with this exact structure:
{
  "is_faceless": boolean,
  "faceless_confidence": number_0_to_100,
  "faceless_signal": "brief evidence quote or explanation, max 100 chars",
  "editing_need_score": number_0_to_100,
  "editing_signals": ["signal1", "signal2"]
}

faceless_confidence = how confident you are in the is_faceless determination.
editing_need_score = how strongly this channel needs ${serviceType} services (0=already professional, 100=strong need).`

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
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    })

    if (!res.ok) {
      return {
        is_faceless: false,
        faceless_confidence: 0,
        faceless_signal: "Analysis failed",
        editing_need_score: 0,
        editing_signals: [],
      }
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      return {
        is_faceless: false,
        faceless_confidence: 0,
        faceless_signal: "No response",
        editing_need_score: 0,
        editing_signals: [],
      }
    }

    const parsed = JSON.parse(content)
    return {
      is_faceless: Boolean(parsed.is_faceless),
      faceless_confidence: Math.max(0, Math.min(100, Number(parsed.faceless_confidence ?? 0))),
      faceless_signal: String(parsed.faceless_signal ?? ""),
      editing_need_score: Math.max(0, Math.min(100, Number(parsed.editing_need_score ?? 0))),
      editing_signals: Array.isArray(parsed.editing_signals)
        ? parsed.editing_signals.map(String).slice(0, 4)
        : [],
    }
  } catch {
    return {
      is_faceless: false,
      faceless_confidence: 0,
      faceless_signal: "Analysis failed",
      editing_need_score: 0,
      editing_signals: [],
    }
  }
}
