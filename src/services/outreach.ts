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
    `Channel name: ${channel.name}`,
    `Niche / content type: ${channel.niche_primary ?? "General"}`,
    `Subscribers: ${formatNumber(channel.subscriber_count)}`,
    `Upload frequency: ${channel.upload_frequency_per_week ? `${channel.upload_frequency_per_week}x/week` : "Unknown"}`,
    `Avg views per video (30d): ${channel.avg_views_30d ? formatNumber(channel.avg_views_30d) : "Unknown"}`,
  ]
  if (channel.description) {
    // Trim to first 400 chars so model can infer content topics from it
    lines.push(`Channel description: ${channel.description.slice(0, 400)}`)
  }
  if (channel.analysis_summary) lines.push(`Content analysis: ${channel.analysis_summary}`)
  if (channel.sponsorship_detected) lines.push(`Has brand sponsorships: yes`)
  return lines.join("\n")
}

export function buildSystemPrompt(serviceType: ServiceType, isSolo = false): string {
  const agencyDescriptions: Record<ServiceType, string> = {
    editing: "video editing agency that helps YouTubers produce higher-quality, faster-paced, more engaging videos",
    thumbnails: "thumbnail design agency that creates high-CTR custom thumbnails that dramatically increase click-through rates",
    scripting: "scriptwriting agency that helps creators structure compelling, well-researched video scripts that retain viewers",
    growth: "YouTube channel growth agency that helps creators optimize their content strategy, SEO, and posting schedule",
    custom: "YouTube services agency offering custom production solutions",
  }
  const soloDescriptions: Record<ServiceType, string> = {
    editing: "freelance video editor who helps YouTubers produce higher-quality, faster-paced, more engaging videos",
    thumbnails: "freelance thumbnail designer who creates high-CTR custom thumbnails that dramatically increase click-through rates",
    scripting: "freelance scriptwriter who helps creators structure compelling, well-researched video scripts that retain viewers",
    growth: "freelance YouTube growth consultant who helps creators optimize their content strategy, SEO, and posting schedule",
    custom: "freelance YouTube production specialist",
  }
  const serviceDescriptions = isSolo ? soloDescriptions : agencyDescriptions

  const serviceOffer: Record<ServiceType, string> = {
    editing:    "handle the editing process while maintaining a clean, engaging style that keeps viewers watching",
    thumbnails: "design custom thumbnails that dramatically increase click-through rate",
    scripting:  "write structured, compelling scripts that retain viewers and improve watch time",
    growth:     "optimize content strategy, SEO, and posting schedule to break through growth plateaus",
    custom:     "handle YouTube production so creators can focus on what they do best",
  }

  return `You are writing a cold outreach email on behalf of a ${serviceDescriptions[serviceType]}.

Write exactly like this real example — study the structure and tone carefully:

---
Hi,

I came across [Channel Name] and noticed your consistent uploads covering [specific content topics from their description/niche].

I currently work with YouTube channels in [sender's niche/space], including channels such as [past client 1], [past client 2], and [past client 3].

I ${serviceOffer[serviceType]}.

Looking at your recent content, I believe I could [specific benefit relevant to this channel] if that's something you're looking for.

If you're interested, I'd be happy to [low-commitment offer — e.g. edit a sample video / design a sample thumbnail / write a sample script] so you can evaluate the quality before making any commitment.

Best regards,
[Name]
[Role]
---

Rules (strictly follow):
- Start with "Hi," — never "Hi [Name]," — we don't know their name
- Paragraph 1: mention the channel name + describe their content topics specifically (infer from description and niche — e.g. "tech products, gadgets, and buying guides" NOT just "tech content")
- Paragraph 2: mention past clients by name (use provided experience list). If no past clients provided, skip this paragraph entirely — do NOT invent names
- Paragraph 3: one sentence on what you do / how you help
- Paragraph 4: one sentence on the specific opportunity you see for THIS channel
- Paragraph 5: low-commitment offer (sample video / sample thumbnail / sample script)
- Sign-off: exactly as provided
- Length: 100-160 words total. Short paragraphs. No filler sentences.
- Never use: "I hope", "I wanted to reach out", "synergy", "leverage", "game-changer", "revolutionize"
- Sound like a real human freelancer, not a marketing agency`
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

// ── Past-work / social-proof helpers ──────────────────────────────────────────
export interface ExperienceLike {
  channel_name: string
  role?: string | null
  result?: string | null
}

/**
 * Build a prompt block describing the sender's past work so the model can weave
 * in credible social proof. Returns "" when there is no experience to mention.
 */
export function buildExperienceInstruction(experiences: ExperienceLike[]): string {
  if (!experiences || experiences.length === 0) return ""
  const lines = experiences.slice(0, 8).map((e) => {
    const parts = [e.channel_name]
    if (e.role) parts.push(`(${e.role})`)
    if (e.result) parts.push(`— ${e.result}`)
    return `- ${parts.join(" ")}`
  })
  return `The sender has worked with these real YouTube channels before:
${lines.join("\n")}

IMPORTANT: You MUST mention 1-2 of these in the email as social proof/credibility. Pick the most impressive or relevant ones. Weave it naturally into the pitch (e.g. "I've worked with X and helped them achieve Y" or "We recently helped X get Z results"). Never list all of them — just the best 1-2. Never fabricate or exaggerate beyond what's listed.`
}
