import type { ServiceType } from "@/types"

export interface KeywordExpansionResult {
  original: string[]
  expanded: string[]
  all: string[]       // original + expanded, deduplicated
}

const SERVICE_CONTEXT: Record<ServiceType, string> = {
  editing: "video editing, post-production, YouTube content creation",
  thumbnails: "thumbnail design, YouTube click-through rate, visual content",
  scripting: "scriptwriting, video storytelling, YouTube content strategy",
  growth: "YouTube channel growth, audience development, content strategy",
  custom: "YouTube content services",
}

export async function expandKeywords(
  keywords: string[],
  serviceType: ServiceType = "editing"
): Promise<KeywordExpansionResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { original: keywords, expanded: [], all: keywords }

  const input = keywords.join(", ")
  const serviceCtx = SERVICE_CONTEXT[serviceType] ?? SERVICE_CONTEXT.editing

  const prompt = `You are helping a ${serviceCtx} agency find YouTube channels to pitch to.

Given these input keywords: "${input}"

Generate 10–15 related search queries that would surface YouTube channels covering the same topics. Think semantically — not just synonyms but the real subjects, sub-topics, notable examples, and adjacent domains that creators in this space actually make videos about.

Rules:
- Each query is 1–4 words
- No duplicates, no brand names unless universally known
- Focus on what the content IS about, not what the channel might be called
- Cover sub-topics, real-world examples, and adjacent concepts

Return a JSON array of strings only. No explanation. Example format:
["infrastructure engineering", "mega construction", "dam building", "railway projects"]`

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        max_tokens: 300,
      }),
    })

    if (!res.ok) return { original: keywords, expanded: [], all: keywords }

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() ?? ""

    // Parse JSON array from response (may be wrapped in ```json ... ```)
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return { original: keywords, expanded: [], all: keywords }

    const parsed: unknown = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return { original: keywords, expanded: [], all: keywords }

    const expanded = parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim().toLowerCase())
      .filter((x) => !keywords.map((k) => k.toLowerCase()).includes(x))

    const all = [...new Set([...keywords.map((k) => k.toLowerCase()), ...expanded])]

    return { original: keywords, expanded, all }
  } catch {
    return { original: keywords, expanded: [], all: keywords }
  }
}

// Compute content-based semantic relevance (0–100) for a channel given the
// expanded concept list. Searches across description + recent titles + recent
// descriptions — NOT the channel name.
export function computeSemanticRelevance(
  concepts: string[],
  channelDescription: string | null,
  recentTitles: string[],
  recentDescriptions: string[]
): { score: number; explanation: string } {
  if (concepts.length === 0) return { score: 50, explanation: "No concept list provided." }

  const corpus = [
    channelDescription ?? "",
    ...recentTitles,
    ...recentDescriptions.map((d) => d.slice(0, 400)), // cap description length per video
  ]
    .join(" ")
    .toLowerCase()

  if (!corpus.trim()) return { score: 0, explanation: "No content to analyze." }

  // Count how many concepts appear (at least once) in the content corpus
  const matchedConcepts: string[] = []
  const unmatchedConcepts: string[] = []
  for (const concept of concepts) {
    const words = concept.toLowerCase().split(/\s+/)
    const allWordsPresent = words.every((w) => corpus.includes(w))
    if (allWordsPresent) matchedConcepts.push(concept)
    else unmatchedConcepts.push(concept)
  }

  // Title-weighted bonus: how many recent titles match at least one concept word
  const titleHits = recentTitles.filter((t) =>
    concepts.some((c) => c.split(/\s+/).some((w) => t.toLowerCase().includes(w)))
  ).length
  const titleHitRatio = recentTitles.length > 0 ? titleHits / recentTitles.length : 0

  const conceptHitRatio = matchedConcepts.length / concepts.length

  // Blend: 60% concept coverage, 40% title hit ratio
  const rawScore = conceptHitRatio * 60 + titleHitRatio * 40
  const score = Math.round(Math.min(100, Math.max(0, rawScore)))

  let explanation: string
  if (matchedConcepts.length === 0) {
    explanation = `No content match — none of the ${concepts.length} related concepts appeared in the channel description or recent videos.`
  } else {
    const topMatches = matchedConcepts.slice(0, 5).join(", ")
    explanation = `Content covers ${matchedConcepts.length}/${concepts.length} related concepts (${topMatches}${matchedConcepts.length > 5 ? "…" : ""}) and ${titleHits}/${recentTitles.length} recent video titles match.`
  }

  return { score, explanation }
}
