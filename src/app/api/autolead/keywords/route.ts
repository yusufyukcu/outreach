import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { service_type, org_niche, previous_keywords = [], successful_patterns = [], user_prompt = "" } = await req.json()

    // Fetch org_id from profile
    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    const orgId = profile?.org_id

    // Fetch won/contacted leads to learn from successful niches
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
      // Fallback keywords without API key
      const fallback: Record<string, string[]> = {
        editing: ["faceless finance", "youtube editing tips", "video production"],
        thumbnails: ["youtube thumbnails", "click-through rate", "channel growth"],
        scripting: ["youtube scripts", "content writing", "video scripts"],
        growth: ["youtube growth", "channel monetization", "subscriber growth"],
        custom: ["youtube channels", "content creation", "video marketing"],
      }
      const keys = fallback[service_type as string] ?? fallback.custom
      return NextResponse.json({ keywords: keys, niche: org_niche ?? "youtube" })
    }

    const previousList = previous_keywords.length > 0
      ? `\n\nAvoid these already-used keywords: ${previous_keywords.join(", ")}`
      : ""

    const wonNicheContext = wonNiches.length > 0
      ? `\n\nOur agency has had success with channels in these niches: ${wonNiches.join(", ")}. Generate keywords targeting similar niches.`
      : ""

    const successfulPatternsContext = successful_patterns.length > 0
      ? `\n\nThese keyword patterns have worked well recently (produced high-scoring channels): ${successful_patterns.join(", ")}. Generate variations and expansions of these.`
      : ""

    const userPromptContext = user_prompt && user_prompt.trim()
      ? `\n\nMOST IMPORTANT — the user is specifically looking for this kind of channel: "${user_prompt.trim()}". Your keywords MUST target exactly this description. Generate fresh variations each time that surface these specific channels.`
      : ""

    const serviceDescriptions: Record<string, string> = {
      editing: "video editing services for YouTube channels",
      thumbnails: "custom thumbnail design for YouTube channels",
      scripting: "video script writing for YouTube creators",
      growth: "YouTube channel growth consulting and strategy",
      custom: "YouTube channel production services",
    }

    const serviceDesc = serviceDescriptions[service_type as string] ?? serviceDescriptions.custom

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert at finding YouTube channels that need ${serviceDesc}. You think like a hunter — you know exactly what types of channels are underserved, growing fast, and likely to outsource production. You generate real YouTube search queries that surface these channels. Return JSON only.`,
          },
          {
            role: "user",
            content: `Generate 4 YouTube search terms to find channels that need ${serviceDesc}.

Context: org niche = "${org_niche ?? "general content"}"

You are generating SHORT SEARCH TERMS (2-5 words max), NOT titles or sentences.
Think like someone searching YouTube for a TYPE of content/channel to watch.

Good examples:
- "passive income investing"
- "faceless finance channel"
- "reddit story narration"
- "UK personal finance"
- "screen recording tutorials"
- "real estate beginner tips"
- "AI tools review"
- "solo female travel"

Bad examples (too long, title-like):
- "AI tools for small businesses 2024" ❌
- "how to make money online fast" ❌
- "best emerging tech gadgets reviews unedited" ❌

Rules:
- MAX 5 words per term
- Niche + format or niche + audience — that's it
- Must surface channels in your niche that need ${serviceDesc}
- Vary: one micro-niche, one format type, one audience angle, one trending topic${userPromptContext}${previousList}${wonNicheContext}${successfulPatternsContext}

Return JSON: { "keywords": ["term1", "term2", "term3", "term4"], "niche": "main niche label" }`,
          },
        ],
        temperature: 0.9,
        response_format: { type: "json_object" },
      }),
    })

    if (!response.ok) {
      throw new Error("OpenAI API error")
    }

    const data = await response.json()
    const content = JSON.parse(data.choices[0].message.content)

    return NextResponse.json({
      keywords: content.keywords ?? [],
      niche: content.niche ?? org_niche ?? "youtube",
    })
  } catch (err) {
    console.error("Keyword generation error:", err)
    return NextResponse.json({ error: "Failed to generate keywords" }, { status: 500 })
  }
}
