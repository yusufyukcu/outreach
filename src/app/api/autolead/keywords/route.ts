import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export type DiscoveryTier = "core" | "adjacent" | "wildcard"

export interface TierResult {
  tier: DiscoveryTier
  target: string
  keywords: string[]
}

// Adjacent niches for common primary niches
const ADJACENT_MAP: Record<string, string[]> = {
  "Technology":       ["Coding", "SaaS", "Productivity", "Entrepreneurship", "Online Business"],
  "Personal Finance": ["Real Estate", "Entrepreneurship", "Side Hustles", "Business", "Investing"],
  "Health & Fitness": ["Nutrition", "Mental Health", "Wellness", "Yoga", "Running"],
  "Food & Cooking":   ["Nutrition", "Lifestyle", "Travel", "Culture", "Homesteading"],
  "Gaming":           ["Technology", "Animation", "Esports", "PC Building", "Streaming"],
  "Travel & Vlogging":["Photography", "Lifestyle", "Outdoor Adventures", "Culture", "Food"],
  "Beauty & Fashion": ["Lifestyle", "Wellness", "Self-Improvement", "Luxury", "DIY"],
  "Business":         ["Personal Finance", "Marketing", "SaaS", "Entrepreneurship", "Freelancing"],
  "Education":        ["Science", "History", "Self-Improvement", "Language Learning", "Productivity"],
  "Music":            ["Entertainment", "Culture", "Dance", "Podcasting", "Audio Production"],
  "Real Estate":      ["Personal Finance", "Entrepreneurship", "Business", "Home Improvement", "Interior Design"],
  "Lifestyle":        ["Travel", "Self-Improvement", "Wellness", "Minimalism", "Relationships"],
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { service_type, org_niche, previous_keywords = [], successful_patterns = [], faceless_mode = false } = await req.json()

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    const orgId = profile?.org_id

    let wonNiches: string[] = []
    if (orgId) {
      const { data: wonLeads } = await supabase
        .from("leads")
        .select("channel:channels(niche_primary, niche_secondary, description)")
        .eq("org_id", orgId)
        .in("crm_stage", ["contacted", "replied"])
        .limit(20)
      if (wonLeads) {
        const nicheSet = new Set<string>()
        for (const lead of wonLeads) {
          const ch = lead.channel as { niche_primary?: string; niche_secondary?: string } | null
          if (ch?.niche_primary) nicheSet.add(ch.niche_primary)
          if (ch?.niche_secondary) nicheSet.add(ch.niche_secondary)
        }
        wonNiches = Array.from(nicheSet).filter(Boolean).slice(0, 10)
      }
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        tiers: [
          { tier: "core", target: org_niche ?? "youtube channels", keywords: ["faceless finance", "budget tech review"] },
          { tier: "adjacent", target: "adjacent niche channels", keywords: ["online business tips"] },
          { tier: "wildcard", target: "experimental discovery", keywords: ["motivational storytelling"] },
        ],
        niche: org_niche ?? "youtube",
      })
    }

    const previousList = previous_keywords.length > 0
      ? `\nAlready used (avoid): ${previous_keywords.join(", ")}` : ""
    const wonNicheCtx = wonNiches.length > 0
      ? `\nSuccessful niches so far: ${wonNiches.join(", ")}` : ""
    const patternsCtx = successful_patterns.length > 0
      ? `\nHigh-performing keyword patterns: ${successful_patterns.join(", ")}` : ""

    const adjacentNiches = ADJACENT_MAP[org_niche ?? ""] ?? ["Entrepreneurship", "Self-Improvement", "Productivity"]

    const facelessCtx = faceless_mode ? `
FACELESS MODE IS ON — only target channels that are or could be faceless:
- Stock footage + voiceover (e.g. "top 10 cities", "most dangerous animals", "luxury lifestyle")
- Narrated list/documentary style (e.g. "iceberg explained", "dark history facts")
- Reddit/text story narration (e.g. "reddit stories", "aita narrated")
- Screen recordings, tutorials, software demos
- Animated explainers, whiteboard videos
- AI-generated or compiled footage channels
Keywords should reflect these formats: "top 10 facts", "faceless documentary", "reddit narration", "stock footage travel", NOT talking head or vlog formats.` : ""

    const serviceDescriptions: Record<string, string> = {
      editing:    "video editing services for YouTube channels",
      thumbnails: "custom thumbnail design for YouTube channels",
      scripting:  "video script writing for YouTube creators",
      growth:     "YouTube channel growth consulting and strategy",
      custom:     "YouTube channel production services",
    }
    const serviceDesc = serviceDescriptions[service_type as string] ?? serviceDescriptions.custom

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a YouTube channel hunter finding channels that need ${serviceDesc}. You think in three discovery tiers. Return JSON only. Search terms must be 1-4 words — the kind of short niche label someone types into YouTube to browse a content category, NOT a video title or sentence.`,
          },
          {
            role: "user",
            content: `Generate discovery search terms across 3 tiers for finding YouTube channels that need ${serviceDesc}.

Primary niche: "${org_niche ?? "general content"}"
Adjacent niches: ${adjacentNiches.join(", ")}
${previousList}${wonNicheCtx}${patternsCtx}${facelessCtx}

CRITICAL RULE — search terms must be 1-4 words, niche/format labels ONLY:
✅ GOOD: "faceless finance", "budget tech", "reddit stories", "UK personal finance", "cooking asmr", "stock market beginner"
❌ BAD (too long / sentence-like): "AI tools for small businesses", "how to make money online", "best gaming channel tips 2024"

Think: what 1-4 word phrase do people TYPE to browse a YouTube niche — not what they search for a specific video.

TIERS:
1. CORE — 3 terms squarely inside "${org_niche ?? "general content"}". Pick a specific underserved sub-niche or format angle.
2. ADJACENT — 2 terms one step outside the primary niche (use adjacent niches list). Different audience, related intent.
3. WILDCARD — 1 term from a completely unexpected niche. High upside, low competition for outreach.

Return JSON:
{
  "tiers": [
    { "tier": "core", "target": "one sentence describing the specific channel type you're hunting", "keywords": ["term1", "term2", "term3"] },
    { "tier": "adjacent", "target": "one sentence", "keywords": ["term1", "term2"] },
    { "tier": "wildcard", "target": "one sentence", "keywords": ["term1"] }
  ],
  "niche": "primary niche label"
}`,
          },
        ],
        temperature: 0.9,
        response_format: { type: "json_object" },
      }),
    })

    if (!response.ok) throw new Error("OpenAI API error")

    const data = await response.json()
    const content = JSON.parse(data.choices[0].message.content)

    return NextResponse.json({
      tiers: content.tiers ?? [],
      niche: content.niche ?? org_niche ?? "youtube",
    })
  } catch (err) {
    console.error("Keyword generation error:", err)
    return NextResponse.json({ error: "Failed to generate keywords" }, { status: 500 })
  }
}
