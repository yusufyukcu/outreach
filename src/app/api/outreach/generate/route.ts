import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildChannelContext, buildSystemPrompt, TONE_INSTRUCTIONS, resolveAgencyName, buildSignature, buildSignatureInstruction, buildExperienceInstruction, type ExperienceLike } from "@/services/outreach"
import type { Channel, ServiceType, OutreachChannel } from "@/types"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const {
      channel,
      serviceType,
      tone,
      outreachChannel,
      agencyName,
      agencyValueProp,
    } = body as {
      channel: Channel
      serviceType: ServiceType
      tone: "professional" | "casual" | "direct"
      outreachChannel: OutreachChannel
      agencyName: string
      agencyValueProp: string
    }

    // Pull the sender's real name and agency from their profile/org so the
    // email is signed correctly instead of "[Your Name]".
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, full_name, organizations(name)")
      .eq("id", user.id)
      .single() as { data: { org_id: string | null; full_name: string | null; organizations: { name: string | null } | null } | null }

    const senderName = profile?.full_name ?? ""
    const orgName = profile?.organizations?.name ?? ""
    const resolvedAgency = resolveAgencyName(agencyName, orgName)
    const signature = buildSignature(senderName, resolvedAgency)

    // Pull the sender's past work as optional social proof for the email.
    let experiences: ExperienceLike[] = []
    if (profile?.org_id) {
      const { data: exp } = await supabase
        .from("work_experiences")
        .select("channel_name, role, result")
        .eq("org_id", profile.org_id)
        .order("created_at", { ascending: false })
        .limit(12)
      experiences = (exp ?? []) as ExperienceLike[]
    }
    const experienceInstruction = buildExperienceInstruction(experiences)

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      // Return a demo message if no API key configured
      return NextResponse.json(buildDemoMessage(channel, serviceType, signature, resolvedAgency))
    }

    const channelContext = buildChannelContext(channel)
    const systemPrompt = buildSystemPrompt(serviceType, !resolvedAgency)
    const toneInstruction = TONE_INSTRUCTIONS[tone]
    const agencyLine = resolvedAgency
      ? `Agency Name: ${resolvedAgency}`
      : `Note: Do not mention a specific agency name anywhere — this is a solo freelancer, not an agency. Use "I" / "my" throughout, never "we" or "our team".`

    const userPrompt = `${toneInstruction}

${agencyLine}
Value Proposition: ${agencyValueProp}
Outreach Channel: ${outreachChannel}

Channel Data:
${channelContext}
${experienceInstruction ? `\n${experienceInstruction}\n` : ""}
Generate a cold outreach message. Return JSON with exactly two fields:
- "subject": the email subject line (if email) or opening hook (if DM)
- "body": the full message body

${buildSignatureInstruction(signature)}

Only return valid JSON, no other text.`

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
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

    if (!response.ok) {
      const err = await response.json()
      console.error("OpenAI error:", err)
      return NextResponse.json(buildDemoMessage(channel, serviceType, signature, resolvedAgency))
    }

    const data = await response.json()
    const content = JSON.parse(data.choices[0].message.content)

    return NextResponse.json({
      subject: content.subject ?? "",
      body: content.body ?? "",
    })
  } catch (err) {
    console.error("Outreach generation error:", err)
    return NextResponse.json({ error: "Failed to generate outreach" }, { status: 500 })
  }
}

function buildDemoMessage(channel: Channel, serviceType: ServiceType, signature: string, agencyName: string) {
  // Inline reference used mid-body; when there's no real agency name, fall back
  // to a neutral phrase rather than printing an empty/placeholder name.
  const us = agencyName || "our team"
  const templates: Record<ServiceType, { subject: string; body: string }> = {
    editing: {
      subject: `Your ${channel.niche_primary ?? "channel"} edits are leaving views on the table`,
      body: `Hey ${channel.name},

Noticed you're putting out ${channel.upload_frequency_per_week ?? 3}+ videos a week — that's impressive output.

Here's the thing: your content consistently hits ${channel.avg_views_30d ? Math.round(channel.avg_views_30d / 1000) + "K" : "strong"} views per video, but the editing style isn't matching that potential. Tighter cuts and better pacing could push your retention from 35% to 55%+ — which directly compounds into more algorithmic pushes.

We edit for ${channel.niche_primary ?? "YouTube"} channels specifically. Would it be useful if I pulled together a quick audit of one of your recent videos?

${signature}`,
    },
    thumbnails: {
      subject: `${channel.name}'s thumbnails vs. what's actually working in ${channel.niche_primary}`,
      body: `Hey ${channel.name},

Quick observation: your videos are getting solid watch time, but your thumbnails are using a style that's 2–3 generations behind what's converting in the ${channel.niche_primary ?? "YouTube"} space right now.

We redesigned thumbnails for 3 similar channels and saw CTR jump from 2.1% to 6.8% within 30 days — same content, completely different clickthrough.

I'd love to show you a before/after mockup using one of your actual videos. No commitment — just a proof of concept.

Worth a look?

${signature}`,
    },
    scripting: {
      subject: `The retention drop at 2:30 in your videos (and why it's fixable)`,
      body: `Hey ${channel.name},

You're uploading consistently — but there's a pattern I keep seeing with ${channel.niche_primary ?? "educational"} channels at your size: viewer drop-off usually happens within the first 3 minutes because the hook isn't structured to create the right tension.

We write scripts specifically for ${channel.niche_primary ?? "YouTube"} — structured to keep viewers past the 5-minute mark where the algorithm starts rewarding watch time.

Would it be useful to see a rewrite of your last video's intro as a quick demo?

${signature}`,
    },
    growth: {
      subject: `${channel.name}'s growth plateau — here's what I found`,
      body: `Hey ${channel.name},

Your content quality is there. Your audience clearly cares. But the last few months show a growth plateau that's really common at the ${Math.round(channel.subscriber_count / 1000)}K subscriber mark.

The issue is almost never the content itself — it's the SEO structure, posting cadence, and how the algorithm is being fed signals.

We've helped 3 channels at your exact stage push through this and hit 2x growth in 90 days. Happy to share the specific framework.

Would that be relevant right now?

${signature}`,
    },
    custom: {
      subject: `Quick question about ${channel.name}`,
      body: `Hey ${channel.name},

Love what you're building in the ${channel.niche_primary ?? "YouTube"} space.

${us === "our team" ? "We" : `We at ${us}`} help channels at your stage level up their production and growth. Would love to share a few specific ideas I had for your channel after reviewing your recent content.

Worth a quick chat?

${signature}`,
    },
  }

  return templates[serviceType] ?? templates.editing
}
