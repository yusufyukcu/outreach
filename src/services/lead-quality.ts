import type { QualityBreakdown, RecentVideoMetrics } from "@/types"
import { formatNumber } from "@/lib/utils"

export interface QualityInput {
  metrics: RecentVideoMetrics
  subscriberCount: number
  nicheSelected: boolean
  nicheRatio: number          // 0..1 relevance to selected niche
  offTargetCategory: string | null
  isEnglish: boolean
  englishOnly: boolean
  businessEmail: string | null
  hasLinks: boolean
  sponsorshipDetected: boolean
  minRecentViews: number      // user-configured floor
}

export interface QualityResult {
  excluded: boolean
  exclusionReason: string | null
  score: number
  breakdown: QualityBreakdown
  badges: string[]
  warnings: string[]
  reasoning: string
}

// Hard rules that remove a channel entirely (never shown, even with the toggle).
function checkExclusions(input: QualityInput): string | null {
  const m = input.metrics

  if (m.recent_video_count === 0) return "No recent videos found"

  if (m.days_since_upload !== null && m.days_since_upload > 60)
    return `Inactive — last upload ${m.days_since_upload} days ago`

  if (m.shorts_pct >= 70 || m.long_form_pct < 15)
    return "Shorts-only channel — not a long-form editing fit"

  if (input.offTargetCategory && (!input.nicheSelected || input.nicheRatio < 0.34))
    return `Off-target category: ${input.offTargetCategory}`

  if (!input.isEnglish && input.englishOnly)
    return "Non-English channel"

  if (m.median_recent_views < Math.max(200, Math.floor(input.minRecentViews * 0.1)))
    return "Negligible recent views — likely dead channel"

  return null
}

// ── Component scorers ──────────────────────────────────────────────────────────

function scoreActivity(m: RecentVideoMetrics): number {
  if (m.days_since_upload === null) return 3 // unknown upload date -> heavy penalty

  let recency: number
  const d = m.days_since_upload
  if (d <= 7) recency = 18
  else if (d <= 14) recency = 15
  else if (d <= 30) recency = 12
  else if (d <= 45) recency = 6
  else recency = 2

  let freq: number
  const f = m.upload_frequency_per_week
  if (f >= 3) freq = 7
  else if (f >= 1.5) freq = 5
  else if (f >= 0.75) freq = 3
  else if (f >= 0.3) freq = 1
  else freq = 0

  return Math.min(25, recency + freq)
}

function scoreRecentViews(m: RecentVideoMetrics): number {
  const v = m.median_recent_views
  let base: number
  if (v >= 100_000) base = 20
  else if (v >= 50_000) base = 18
  else if (v >= 25_000) base = 15
  else if (v >= 10_000) base = 12
  else if (v >= 5_000) base = 9
  else if (v >= 2_000) base = 6
  else if (v >= 500) base = 3
  else base = 1

  // Engagement bonus / penalty (avg recent views / subscribers)
  const r = m.engagement_ratio
  if (r >= 0.15) base += 2
  else if (r > 0 && r < 0.005) base -= 8   // suspicious / dead
  else if (r > 0 && r < 0.01) base -= 4    // very low engagement

  return Math.max(0, Math.min(20, base))
}

function scoreLongForm(m: RecentVideoMetrics): number {
  const pct = m.long_form_pct
  if (pct >= 80) return 15
  if (pct >= 60) return 12
  if (pct >= 40) return 9
  if (pct >= 20) return 5
  return 1
}

function scoreNiche(input: QualityInput): number {
  if (!input.nicheSelected) return 11 // no niche chosen -> neutral-good
  return Math.round(input.nicheRatio * 15)
}

function scoreBusinessPotential(input: QualityInput): number {
  const m = input.metrics
  let s = 0
  if (input.businessEmail) s += 5
  if (input.hasLinks) s += 3
  if (m.long_form_pct >= 50) s += 3
  if (m.median_recent_views >= 10_000) s += 2
  if (input.sponsorshipDetected) s += 2
  return Math.min(15, s)
}

function scoreContactAvailability(input: QualityInput): number {
  if (input.businessEmail) return 10
  if (input.hasLinks) return 5
  return 0
}

// ── Badges, warnings, reasoning ──────────────────────────────────────────────────

function buildBadges(input: QualityInput): string[] {
  const m = input.metrics
  const badges: string[] = []
  if (m.days_since_upload !== null && m.days_since_upload <= 30) badges.push("Active")
  if (m.long_form_pct >= 50) badges.push("Long-form")
  if (m.median_recent_views >= 25_000) badges.push("Strong views")
  if (m.upload_frequency_per_week >= 1) badges.push("Consistent")
  if (input.businessEmail) badges.push("Business email found")
  else if (input.hasLinks) badges.push("Contact links")
  if (input.sponsorshipDetected) badges.push("Has sponsors")
  return badges
}

function buildWarnings(input: QualityInput): string[] {
  const m = input.metrics
  const warnings: string[] = []
  if (m.days_since_upload !== null && m.days_since_upload > 30) warnings.push("Inactive")
  if (m.long_form_pct < 30) warnings.push("Shorts-heavy")
  if (m.engagement_ratio > 0 && m.engagement_ratio < 0.01) warnings.push("Low engagement")
  if (m.median_recent_views < 2_000) warnings.push("Low views")
  if (input.nicheSelected && input.nicheRatio < 0.34) warnings.push("Niche mismatch")
  if (!input.businessEmail && !input.hasLinks) warnings.push("No contact info")
  return warnings
}

function buildReasoning(input: QualityInput, breakdown: QualityBreakdown): string {
  const m = input.metrics
  const parts: string[] = []

  if (m.days_since_upload !== null) {
    const recent = m.recent_video_count
    const lf = Math.round((m.long_form_pct / 100) * recent)
    parts.push(
      `uploaded ${lf > 0 ? `${lf} long-form` : `${recent}`} video${recent === 1 ? "" : "s"} recently (last ${m.days_since_upload}d ago)`
    )
  }
  if (m.median_recent_views > 0) {
    parts.push(`averages ${formatNumber(m.median_recent_views)} views`)
  }
  if (m.upload_frequency_per_week >= 1) {
    parts.push(`posts ~${m.upload_frequency_per_week}/week`)
  }
  if (m.long_form_pct >= 50) {
    parts.push(`${m.long_form_pct}% long-form content`)
  }
  if (input.businessEmail) parts.push("has a business email")
  else if (input.hasLinks) parts.push("has public contact links")

  const quality =
    breakdown.total >= 85 ? "Excellent" :
    breakdown.total >= 75 ? "High-quality" :
    breakdown.total >= 55 ? "Decent" : "Lower-quality"

  if (parts.length === 0) return `${quality} lead.`
  const body = parts.join(", ").replace(/,([^,]*)$/, ", and$1")
  return `${quality} lead because the channel ${body}.`
}

// ── Public API ───────────────────────────────────────────────────────────────

export function evaluateLead(input: QualityInput): QualityResult {
  const exclusionReason = checkExclusions(input)
  if (exclusionReason) {
    return {
      excluded: true,
      exclusionReason,
      score: 0,
      breakdown: {
        activity: 0, recent_views: 0, long_form: 0,
        niche_match: 0, business_potential: 0, contact_availability: 0, total: 0,
      },
      badges: [],
      warnings: [exclusionReason],
      reasoning: `Excluded: ${exclusionReason}.`,
    }
  }

  const activity = scoreActivity(input.metrics)
  const recentViews = scoreRecentViews(input.metrics)
  const longForm = scoreLongForm(input.metrics)
  const nicheMatch = scoreNiche(input)
  const businessPotential = scoreBusinessPotential(input)
  const contactAvailability = scoreContactAvailability(input)

  const total = Math.max(
    0,
    Math.min(100, activity + recentViews + longForm + nicheMatch + businessPotential + contactAvailability)
  )

  const breakdown: QualityBreakdown = {
    activity,
    recent_views: recentViews,
    long_form: longForm,
    niche_match: nicheMatch,
    business_potential: businessPotential,
    contact_availability: contactAvailability,
    total,
  }

  return {
    excluded: false,
    exclusionReason: null,
    score: total,
    breakdown,
    badges: buildBadges(input),
    warnings: buildWarnings(input),
    reasoning: buildReasoning(input, breakdown),
  }
}

export const QUALITY_WEIGHTS: { key: keyof QualityBreakdown; label: string; max: number }[] = [
  { key: "activity", label: "Activity", max: 25 },
  { key: "recent_views", label: "Recent Views", max: 20 },
  { key: "long_form", label: "Long-Form", max: 15 },
  { key: "niche_match", label: "Niche Match", max: 15 },
  { key: "business_potential", label: "Business Potential", max: 15 },
  { key: "contact_availability", label: "Contact Availability", max: 10 },
]
