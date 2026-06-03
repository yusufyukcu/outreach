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

    const { service_type, org_niche, previous_keywords = [], successful_patterns = [] } = await req.json()

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    const orgId = profile?.org_id

    let wonNiches: string[] = []
    if (orgId) {
      const { data: wonLeads } = await supabase
        .from("leads")
        .select("channel:channels(niche_primary, niche_secondary, description)")
        .eq("org_id", orgId)
        .in("crm_stage", ["won", "contacted", "interested", "replied"])
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
            content: `You are a YouTube channel hunter finding channels that need ${serviceDesc}. You think in three discovery tiers. Return JSON only.`,
          },
          {
            role: "user",
            content: `Generate discovery keywords across 3 tiers for finding channels that need ${serviceDesc}.

Primary niche: "${org_niche ?? "general content"}"
Adjacent niches to consider: ${adjacentNiches.join(", ")}
${previousList}${wonNicheCtx}${patternsCtx}

TIERS:
1. CORE (70% of effort) — Channels squarely inside "${org_niche ?? "general content"}". Invent a specific sub-niche/format target, then 3 short search terms.
2. ADJACENT (20%) — One step away from the primary niche (pick from adjacent niches above). Invent a target, then 2 short search terms.
3. WILDCARD (10%) — Completely different niche, high potential but unexpected. Be bold. Invent a surprising target, then 1 short search term.

All search terms: 2-5 words max, like real YouTube searches. NOT titles or sentences.
Good: "faceless finance channel", "budget tech review", "reddit story narration"
Bad: "AI tools for small businesses 2024" ❌

Return JSON:
{
  "tiers": [
    { "tier": "core", "target": "description of specific channel type", "keywords": ["term1", "term2", "term3"] },
    { "tier": "adjacent", "target": "description", "keywords": ["term1", "term2"] },
    { "tier": "wildcard", "target": "description", "keywords": ["term1"] }
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
