import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildChannelContext, buildSystemPrompt, TONE_INSTRUCTIONS, resolveAgencyName, buildSignature, buildSignatureInstruction, buildExperienceInstruction, type ExperienceLike } from "@/services/outreach"
import type { Channel, ServiceType } from "@/types"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, full_name, organizations(name)")
      .eq("id", user.id)
      .single() as { data: { org_id: string; full_name: string | null; organizations: { name: string | null } | null } | null }
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

    // Fetch leads with channels. `contacts` has no direct FK to `leads`, so we
    // fetch contacts separately by channel_id and merge them in.
    const { data: leadsRaw } = await supabase
      .from("leads")
      .select("id, channel_id, channel:channels(*)")
      .eq("org_id", profile.org_id)
      .in("id", lead_ids)

    if (!leadsRaw || leadsRaw.length === 0) {
      return NextResponse.json({ error: "No leads found" }, { status: 404 })
    }

    const channelIds = [...new Set(leadsRaw.map((l) => l.channel_id).filter(Boolean))]
    let contactsByChannel: Record<string, unknown> = {}
    if (channelIds.length > 0) {
      const { data: contacts } = await supabase.from("contacts").select("*").in("channel_id", channelIds)
      contactsByChannel = Object.fromEntries((contacts ?? []).map((c) => [c.channel_id, c]))
    }
    const leads = leadsRaw.map((l) => ({ ...l, contact: contactsByChannel[l.channel_id] ?? null }))

    // Sign emails with the sender's real name + agency (org name), omitting the
    // agency when it's an unchanged default like "My Agency".
    const resolvedAgency = resolveAgencyName(agency_name, profile.organizations?.name)
    const signature = buildSignature(profile.full_name, resolvedAgency)
    const agencyLine = resolvedAgency
      ? `Agency Name: ${resolvedAgency}`
      : `Note: Do not mention a specific agency name anywhere — refer to your side as "we" / "our team".`

    // Past work, shared across all generated emails as optional social proof.
    const { data: expRows } = await supabase
      .from("work_experiences")
      .select("channel_name, role, result")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })
      .limit(12)
    const experienceInstruction = buildExperienceInstruction((expRows ?? []) as ExperienceLike[])

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
              body: `Hey ${channel.name},\n\nI've been following your channel and think we could help you grow.\n\nWould love to share a few ideas — worth a quick chat?\n\n${signature}`,
            }
          }

          const channelContext = buildChannelContext(channel)
          const systemPrompt = buildSystemPrompt(service_type)
          const toneInstruction = TONE_INSTRUCTIONS[tone]

          const userPrompt = `${toneInstruction}

${agencyLine}
Value Proposition: ${agency_value_prop || "We help YouTube channels grow with professional services"}
Outreach Channel: email

Channel Data:
${channelContext}
${experienceInstruction ? `\n${experienceInstruction}\n` : ""}
Generate a concise cold outreach email. Return JSON with exactly:
- "subject": email subject line
- "body": email body (max 150 words, punchy, personalized)

${buildSignatureInstruction(signature)}

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
            body: `Hey ${channel.name},\n\nI've been following your channel and would love to connect.\n\n${signature}`,
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
