export interface WonProfile {
  avg_subscriber_count: number
  avg_engagement_ratio: number
  avg_upload_freq: number
  avg_long_form_pct: number
  avg_median_views: number
  count: number
}

export function buildWonProfile(wonChannels: Array<{
  subscriber_count: number
  engagement_ratio: number
  upload_freq: number
  long_form_pct: number
  median_views: number
}>): WonProfile | null {
  if (wonChannels.length < 3) return null

  const count = wonChannels.length
  return {
    avg_subscriber_count: wonChannels.reduce((s, c) => s + c.subscriber_count, 0) / count,
    avg_engagement_ratio: wonChannels.reduce((s, c) => s + c.engagement_ratio, 0) / count,
    avg_upload_freq: wonChannels.reduce((s, c) => s + c.upload_freq, 0) / count,
    avg_long_form_pct: wonChannels.reduce((s, c) => s + c.long_form_pct, 0) / count,
    avg_median_views: wonChannels.reduce((s, c) => s + c.median_views, 0) / count,
    count,
  }
}

/**
 * Gaussian-like falloff: full points if within 20% of avg, decreasing smoothly beyond.
 * Returns value in [0, 1].
 */
function dimensionScore(value: number, avg: number): number {
  if (avg === 0) return value === 0 ? 1 : 0
  const ratio = value / avg
  // Use a Gaussian: exp(-((ratio-1)^2) / (2 * sigma^2)), sigma = 0.6 -> ~0.2 range gets ≥ 0.93
  const sigma = 0.6
  return Math.exp(-((ratio - 1) ** 2) / (2 * sigma * sigma))
}

export function scoreAgainstWonProfile(
  subscriberCount: number,
  engagementRatio: number,
  uploadFreq: number,
  longFormPct: number,
  medianViews: number,
  profile: WonProfile
): number {
  // Weights: subscriber count most important, then views, engagement, upload freq, long form
  const weights = {
    subscribers: 0.3,
    medianViews: 0.25,
    engagement: 0.2,
    uploadFreq: 0.15,
    longFormPct: 0.1,
  }

  const score =
    dimensionScore(subscriberCount, profile.avg_subscriber_count) * weights.subscribers +
    dimensionScore(medianViews, profile.avg_median_views) * weights.medianViews +
    dimensionScore(engagementRatio, profile.avg_engagement_ratio) * weights.engagement +
    dimensionScore(uploadFreq, profile.avg_upload_freq) * weights.uploadFreq +
    dimensionScore(longFormPct, profile.avg_long_form_pct) * weights.longFormPct

  return Math.round(score * 100)
}
