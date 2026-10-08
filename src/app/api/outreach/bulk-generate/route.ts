import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildChannelContext, buildSystemPrompt, TONE_INSTRUCTIONS, resolveAgencyName, buildSignature, buildSignatureInstruction, buildExperienceInstruction, OUTREACH_MODEL, OUTREACH_TEMPERATURE, type ExperienceLike } from "@/services/outreach"
import { recordResearchEvents, textHash, wordCount, isUuid, type ResearchEvent } from "@/services/research"
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
      : `Note: Do not mention a specific agency name anywhere — this is a solo freelancer, not an agency. Use "I" / "my" throughout, never "we" or "our team".`

    // Past work, shared across all generated emails as optional social proof.
    const { data: expRows } = await supabase
      .from("work_experiences")
      .select("channel_name, role, result")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })
      .limit(12)
    const experienceInstruction = buildExperienceInstruction((expRows ?? []) as ExperienceLike[])

    const apiKey = process.env.OPENAI_API_KEY

    // Research logging: how each draft was produced (no text stored, only a hash)
    const generationEvents: ResearchEvent[] = []
    const logGeneration = (lead: { id: string; channel_id: string }, email: { subject: unknown; body: unknown }, details: Record<string, unknown>) => {
      const subject = String(email.subject ?? "")
      const text = String(email.body ?? "")
      generationEvents.push({
        org_id: profile.org_id,
        event_type: "email_generated",
        lead_id: lead.id,
        channel_id: isUuid(lead.channel_id) ? lead.channel_id : null,
        payload: {
          route: "bulk",
          tone,
          service_type,
          outreach_channel: "email",
          solo_sender: !resolvedAgency,
          experiences_available: (expRows ?? []).length,
          subject_chars: subject.length,
          body_words: wordCount(text),
          body_sha256: textHash(text),
          ...details,
        },
      })
    }

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
            const demo = {
              subject: `Quick question for ${channel.name}`,
              body: `Hey ${channel.name},\n\nI've been following your channel and think we could help you grow.\n\nWould love to share a few ideas — worth a quick chat?\n\n${signature}`,
            }
            logGeneration(lead, demo, { generator: "template_fallback", reason: "no_api_key" })
            return {
              lead_id: lead.id,
              channel_name: channel.name,
              email: contactEmail,
              ...demo,
            }
          }

          const channelContext = buildChannelContext(channel)
          const systemPrompt = buildSystemPrompt(service_type, !resolvedAgency)
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
              model: OUTREACH_MODEL,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: OUTREACH_TEMPERATURE,
              response_format: { type: "json_object" },
            }),
          })

          if (!res.ok) throw new Error("OpenAI error")
          const data = await res.json()
          const content = JSON.parse(data.choices[0].message.content)

          const email = {
            subject: content.subject ?? "",
            body: content.body ?? "",
          }
          logGeneration(lead, email, {
            generator: "llm",
            model: OUTREACH_MODEL,
            temperature: OUTREACH_TEMPERATURE,
            system_prompt_sha: textHash(systemPrompt).slice(0, 12),
          })
          return {
            lead_id: lead.id,
            channel_name: channel.name,
            email: contactEmail,
            ...email,
          }
        } catch {
          const fallback = {
            subject: `Quick question for ${channel.name}`,
            body: `Hey ${channel.name},\n\nI've been following your channel and would love to connect.\n\n${signature}`,
          }
          logGeneration(lead, fallback, { generator: "template_fallback", reason: "generation_error" })
          return {
            lead_id: lead.id,
            channel_name: channel.name,
            email: contactEmail,
            ...fallback,
          }
        }
      })
    )

    await recordResearchEvents(supabase, generationEvents)

    return NextResponse.json({ results })
  } catch (err) {
    console.error("Bulk generate error:", err)
    return NextResponse.json({ error: "Failed to generate" }, { status: 500 })
  }
}
