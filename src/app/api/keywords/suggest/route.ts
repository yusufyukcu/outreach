import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { ServiceType } from "@/types"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { prompt, service_type } = await req.json() as { prompt: string; service_type: ServiceType }
    if (!prompt?.trim()) return NextResponse.json({ error: "No prompt provided" }, { status: 400 })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 })

    const systemPrompt = `You help a YouTube ${service_type ?? "editing"} agency find channels to pitch to.
The user will describe the type of YouTube channel they want to find.
Your job is to output the best YouTube search keywords to surface those channels.

Rules:
- Return 3-6 comma-separated keywords/phrases
- Keywords should be what those channels actually title their videos OR what their niche is about
- If the user describes a faceless / stock-footage / voiceover / list-style channel, set faceless_recommended to true
- Keep keywords short (1-4 words each)

Respond with valid JSON only:
{"keywords": "keyword1, keyword2, keyword3", "faceless_recommended": true}`

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 150,
        response_format: { type: "json_object" },
      }),
    })

    if (!res.ok) throw new Error("OpenAI request failed")
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    const parsed = JSON.parse(content)

    return NextResponse.json({
      keywords: parsed.keywords ?? "",
      faceless_recommended: parsed.faceless_recommended ?? false,
    })
  } catch (err) {
    console.error("Keyword suggest error:", err)
    return NextResponse.json({ error: "Failed to generate keywords" }, { status: 500 })
  }
}
