import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { service_type, org_niche, previous_keywords = [] } = await req.json()

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
            content: `You are a YouTube channel discovery expert. Generate search keywords to find YouTube channels that would benefit from ${serviceDesc}. Focus on niches, topics, and channel types that match. Return JSON only.`,
          },
          {
            role: "user",
            content: `Generate 4 creative and varied YouTube search keywords to discover channels in the "${org_niche ?? "general"}" space that would benefit from ${serviceDesc}.

Requirements:
- Each keyword should target a different angle or sub-niche
- Use specific, searchable terms (not too broad)
- Mix keyword styles: some niche-specific, some topic-based, some format-based
- Return JSON: { "keywords": ["keyword1", "keyword2", ...], "niche": "detected niche" }${previousList}`,
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
