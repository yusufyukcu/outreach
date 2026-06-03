import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { service_type, org_niche, previous_keywords = [], successful_patterns = [] } = await req.json()

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
            content: `Generate 4 high-quality YouTube search queries to find channels that desperately need ${serviceDesc}.

Context: org niche = "${org_niche ?? "general content"}"

Think about:
- Fast-growing niches where creators are overwhelmed (e.g. "AI tools explained", "real estate investing 2024", "solo travel vlog")
- Channels that post raw/unedited content and need help (e.g. "talking head business advice", "screen recording tutorials")
- Specific content formats that signal outsourcing potential (e.g. "faceless documentary", "top 10 facts channel", "reddit story narration")
- Emerging micro-niches with lots of uploads but low production quality
- Geographic or demographic niches often overlooked (e.g. "UK personal finance", "Spanish language fitness")

Rules:
- Each query must be something a real person would type into YouTube search
- Be SPECIFIC — not "finance youtube" but "passive income investing beginner 2024"
- Vary the angles: one niche topic, one format type, one pain-point angle, one trending sub-niche
- NO generic terms like "youtube channel", "video editing tips", "content creation"${previousList}${wonNicheContext}${successfulPatternsContext}

Return JSON: { "keywords": ["query1", "query2", "query3", "query4"], "niche": "main niche label" }`,
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
