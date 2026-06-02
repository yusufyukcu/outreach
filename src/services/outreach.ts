import type { Channel, ServiceType, OutreachChannel } from "@/types"
import { formatNumber } from "@/lib/utils"

interface GenerateOutreachParams {
  channel: Channel
  serviceType: ServiceType
  tone: "professional" | "casual" | "direct"
  outreachChannel: OutreachChannel
  agencyName: string
  agencyValueProp: string
}

export async function generateOutreachMessage(params: GenerateOutreachParams): Promise<{
  subject: string
  body: string
}> {
  const res = await fetch("/api/outreach/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error ?? "Failed to generate outreach")
  }

  return res.json()
}

export function buildChannelContext(channel: Channel): string {
  const lines: string[] = [
    `Channel: ${channel.name}`,
    `Niche: ${channel.niche_primary ?? "General"}`,
    `Subscribers: ${formatNumber(channel.subscriber_count)}`,
    `Avg Monthly Views: ${channel.avg_views_30d ? formatNumber(channel.avg_views_30d) : "Unknown"}`,
    `Upload Frequency: ${channel.upload_frequency_per_week ? `${channel.upload_frequency_per_week}x/week` : "Unknown"}`,
    `Growth Trend (30d): ${channel.growth_trend_30d ? `${channel.growth_trend_30d > 0 ? "+" : ""}${channel.growth_trend_30d}%` : "Unknown"}`,
    `Estimated Monthly Revenue: $${channel.estimated_monthly_revenue_min?.toLocaleString() ?? "?"} – $${channel.estimated_monthly_revenue_max?.toLocaleString() ?? "?"}`,
    `Editing Quality Score: ${channel.editing_quality_score ?? "?"}/100`,
    `Thumbnail Quality Score: ${channel.thumbnail_quality_score ?? "?"}/100`,
    `Monetization: ${channel.monetization_enabled ? "Yes" : "No"}`,
    `Sponsorships Detected: ${channel.sponsorship_detected ? "Yes" : "No"}`,
  ]
  if (channel.analysis_summary) lines.push(`Analysis: ${channel.analysis_summary}`)
  return lines.join("\n")
}

export function buildSystemPrompt(serviceType: ServiceType): string {
  const serviceDescriptions: Record<ServiceType, string> = {
    editing: "video editing agency that helps YouTubers produce higher-quality, faster-paced, more engaging videos",
    thumbnails: "thumbnail design agency that creates high-CTR custom thumbnails that dramatically increase click-through rates",
    scripting: "scriptwriting agency that helps creators structure compelling, well-researched video scripts that retain viewers",
    growth: "YouTube channel growth agency that helps creators optimize their content strategy, SEO, and posting schedule",
    custom: "YouTube services agency offering custom production solutions",
  }

  return `You are an expert cold outreach copywriter for a ${serviceDescriptions[serviceType]}.

Your job is to write highly personalized, compelling cold outreach messages to YouTube channel owners.

Rules:
- Reference SPECIFIC details about the channel (not generic)
- Lead with value, not your agency
- Identify one specific problem or opportunity for this channel
- Keep subject lines under 8 words and curiosity-driven
- Keep email body under 150 words
- End with a low-friction CTA (not "schedule a call" — use "would this be useful?")
- Never use: "I hope this finds you well", "I came across your channel", "synergy", "leverage"
- Sound like a smart human, not a sales robot
- Match the requested tone`
}

export const TONE_INSTRUCTIONS = {
  professional: "Tone: Professional and credible. Use data and results. Formal but not stiff.",
  casual: "Tone: Casual and friendly. Write like a fellow creator, not an agency. Use contractions.",
  direct: "Tone: Direct and concise. No fluff. State the problem and the solution immediately.",
}

// ── Signature helpers ─────────────────────────────────────────────────────────
// Agency names that are placeholders / unchanged defaults. When the agency name
// is one of these, we omit it from the email sign-off entirely.
const DEFAULT_AGENCY_NAMES = new Set(["", "my agency", "your agency"])

export function isRealAgencyName(name: string | null | undefined): boolean {
  return !!name && !DEFAULT_AGENCY_NAMES.has(name.trim().toLowerCase())
}

/**
 * Resolve the agency name to use, preferring an explicitly provided value and
 * falling back to the organization name. Returns "" when neither is a real,
 * non-default name (so it can be omitted from the signature).
 */
export function resolveAgencyName(
  provided: string | null | undefined,
  orgName: string | null | undefined,
): string {
  if (isRealAgencyName(provided)) return provided!.trim()
  if (isRealAgencyName(orgName)) return orgName!.trim()
  return ""
}

/** Build the email sign-off from the sender's real name + (optional) agency. */
export function buildSignature(
  senderName: string | null | undefined,
  agencyName: string,
): string {
  const lines: string[] = []
  const name = senderName?.trim()
  if (name) lines.push(name)
  if (agencyName) lines.push(agencyName)
  return lines.length > 0 ? `Best regards,\n${lines.join("\n")}` : "Best regards,"
}

/** Prompt instruction telling the model to use the exact sign-off, no placeholders. */
export function buildSignatureInstruction(signature: string): string {
  return `End the message with EXACTLY this sign-off, each item on its own line. Do NOT invent a name and do NOT use placeholders like "[Your Name]" or "[Your Agency]":

${signature}`
}
