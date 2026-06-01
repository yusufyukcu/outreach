import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildChannelContext, buildSystemPrompt, TONE_INSTRUCTIONS } from "@/services/outreach"
import type { Channel, ServiceType } from "@/types"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 400 })

    const { lead_ids, agency_name, agency_value_prop, service_type, tone } = await req.json() as {
      lead_ids: string[]
      agency_name: string
      agency_value_prop: string
      service_type: ServiceType
      tone: "professional" | "casual" | "direct"
    }

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ error: "No lead IDs provided" }, { status: 400 })
    }

    // Fetch leads with channels
    const { data: leads } = await supabase
      .from("leads")
      .select("id, channel:channels(*), contact:contacts(*)")
      .eq("org_id", profile.org_id)
      .in("id", lead_ids)

    if (!leads || leads.length === 0) {
      return NextResponse.json({ error: "No leads found" }, { status: 404 })
    }

    const apiKey = process.env.OPENAI_API_KEY

    const results = await Promise.all(
      leads.map(async (lead) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = lead.channel as any as Channel | null
        if (!channel) return { lead_id: lead.id, error: "No channel data" }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contactEmail = (lead.contact as any)?.email ?? null
        try {
          if (!apiKey) {
            // Demo fallback
            return {
              lead_id: lead.id,
              channel_name: channel.name,
              email: contactEmail,
              subject: `Quick question for ${channel.name}`,
              body: `Hey ${channel.name},\n\nI've been following your channel and think we could help you grow.\n\nWould love to share a few ideas — worth a quick chat?\n\n— ${agency_name || "Your Agency"}`,
            }
          }

          const channelContext = buildChannelContext(channel)
          const systemPrompt = buildSystemPrompt(service_type)
          const toneInstruction = TONE_INSTRUCTIONS[tone]

          const userPrompt = `${toneInstruction}

Agency Name: ${agency_name || "Your Agency"}
Value Proposition: ${agency_value_prop || "We help YouTube channels grow with professional services"}
Outreach Channel: email

Channel Data:
${channelContext}

Generate a concise cold outreach email. Return JSON with exactly:
- "subject": email subject line
- "body": email body (max 150 words, punchy, personalized)

Only return valid JSON.`

          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: 0.8,
              response_format: { type: "json_object" },
            }),
          })

          if (!res.ok) throw new Error("OpenAI error")
          const data = await res.json()
          const content = JSON.parse(data.choices[0].message.content)

          return {
            lead_id: lead.id,
            channel_name: channel.name,
            email: contactEmail,
            subject: content.subject ?? "",
            body: content.body ?? "",
          }
        } catch {
          return {
            lead_id: lead.id,
            channel_name: channel.name,
            email: contactEmail,
            subject: `Quick question for ${channel.name}`,
            body: `Hey ${channel.name},\n\nI've been following your channel and would love to connect.\n\n— ${agency_name || "Your Agency"}`,
          }
        }
      })
    )

    return NextResponse.json({ results })
  } catch (err) {
    console.error("Bulk generate error:", err)
    return NextResponse.json({ error: "Failed to generate" }, { status: 500 })
  }
}
