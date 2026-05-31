import type { Channel, ScoreBreakdown, ServiceType } from "@/types"

export function scoreChannel(channel: Channel, serviceType: ServiceType): ScoreBreakdown {
  const growth = scoreGrowthVelocity(channel.growth_trend_30d)
  const upload = scoreUploadFrequency(channel.upload_frequency_per_week)
  const revenue = scoreRevenuePotential(channel.estimated_monthly_revenue_max, channel.sponsorship_detected)
  const sweet = scoreSubscriberSweetSpot(channel.subscriber_count)
  const outsource = scoreOutsourcingLikelihood(channel.outsourcing_likelihood_score)
  const quality = scoreQualityGap(channel, serviceType)
  const engagement = scoreEngagement(channel.avg_views_30d, channel.subscriber_count)
  const consistency = scoreContentConsistency(channel.upload_frequency_per_week)

  const total = growth + upload + revenue + sweet + outsource + quality + engagement + consistency

  return {
    growth_velocity: growth,
    upload_frequency: upload,
    revenue_potential: revenue,
    subscriber_sweet_spot: sweet,
    outsourcing_likelihood: outsource,
    quality_gap: quality,
    engagement_quality: engagement,
    content_consistency: consistency,
    total: Math.min(100, total),
  }
}

function scoreGrowthVelocity(growthTrend: number | null): number {
  if (growthTrend === null) return 5
  if (growthTrend >= 15) return 20
  if (growthTrend >= 10) return 17
  if (growthTrend >= 5) return 13
  if (growthTrend >= 2) return 8
  if (growthTrend >= 0) return 4
  return 0
}

function scoreUploadFrequency(freq: number | null | undefined): number {
  if (!freq) return 2
  if (freq >= 4) return 10
  if (freq >= 3) return 8
  if (freq >= 2) return 6
  if (freq >= 1) return 4
  if (freq >= 0.25) return 2
  return 0
}

function scoreRevenuePotential(maxRevenue: number | null, hasSponsorships: boolean): number {
  let base = 0
  if (!maxRevenue) return 1
  if (maxRevenue >= 50000) base = 15
  else if (maxRevenue >= 20000) base = 13
  else if (maxRevenue >= 10000) base = 10
  else if (maxRevenue >= 5000) base = 7
  else if (maxRevenue >= 2000) base = 4
  else base = 1
  return hasSponsorships ? Math.min(15, base + 2) : base
}

function scoreSubscriberSweetSpot(subs: number): number {
  if (subs >= 50000 && subs <= 200000) return 10
  if ((subs >= 20000 && subs < 50000) || (subs > 200000 && subs <= 500000)) return 8
  if ((subs >= 10000 && subs < 20000) || (subs > 500000 && subs <= 1000000)) return 5
  if (subs >= 5000 && subs < 10000) return 3
  if (subs > 1000000) return 2
  return 0
}

function scoreOutsourcingLikelihood(score: number | null): number {
  if (!score) return 2
  if (score >= 75) return 15
  if (score >= 50) return 11
  if (score >= 25) return 6
  return 2
}

function scoreQualityGap(channel: Channel, serviceType: ServiceType): number {
  switch (serviceType) {
    case "editing": {
      const quality = channel.editing_quality_score ?? 50
      // Lower editing quality = higher score (opportunity)
      if (quality <= 30) return 15
      if (quality <= 45) return 12
      if (quality <= 60) return 8
      if (quality <= 75) return 4
      return 1
    }
    case "thumbnails": {
      const quality = channel.thumbnail_quality_score ?? 50
      if (quality <= 30) return 15
      if (quality <= 45) return 12
      if (quality <= 60) return 8
      if (quality <= 75) return 4
      return 1
    }
    case "scripting": {
      // Proxy: low engagement on high-sub channels suggests poor scripting
      const engRate = channel.avg_views_30d
        ? (channel.avg_views_30d / channel.subscriber_count) * 100
        : 5
      if (engRate < 2) return 15
      if (engRate < 5) return 10
      if (engRate < 10) return 6
      return 3
    }
    case "growth": {
      const growth = channel.growth_trend_30d ?? 0
      // Low growth on established channel = growth opportunity
      if (growth < 2 && channel.subscriber_count > 20000) return 15
      if (growth < 5) return 10
      if (growth < 10) return 6
      return 3
    }
    default:
      return 8
  }
}

function scoreEngagement(avgViews: number | null, subscribers: number): number {
  if (!avgViews || !subscribers) return 3
  const rate = (avgViews / subscribers) * 100
  if (rate >= 5) return 10
  if (rate >= 3) return 8
  if (rate >= 2) return 6
  if (rate >= 1) return 4
  if (rate >= 0.5) return 2
  return 0
}

function scoreContentConsistency(freq: number | null | undefined): number {
  if (!freq) return 1
  if (freq >= 1) return 5
  if (freq >= 0.5) return 3
  return 1
}

export function getScoreExplanations(breakdown: ScoreBreakdown): Record<string, string> {
  return {
    "Growth Velocity": `${breakdown.growth_velocity}/20 — ${breakdown.growth_velocity >= 15 ? "Channel growing rapidly (>15%/month)" : breakdown.growth_velocity >= 8 ? "Moderate growth detected" : "Slow or no growth"}`,
    "Upload Frequency": `${breakdown.upload_frequency}/10 — ${breakdown.upload_frequency >= 8 ? "High upload volume (3+ videos/week)" : breakdown.upload_frequency >= 4 ? "Regular upload schedule" : "Infrequent uploads"}`,
    "Revenue Potential": `${breakdown.revenue_potential}/15 — ${breakdown.revenue_potential >= 10 ? "High estimated revenue — strong budget" : breakdown.revenue_potential >= 5 ? "Moderate revenue potential" : "Limited budget signals"}`,
    "Subscriber Sweet Spot": `${breakdown.subscriber_sweet_spot}/10 — ${breakdown.subscriber_sweet_spot >= 8 ? "Ideal size range (10K–500K)" : "Outside ideal range"}`,
    "Outsourcing Signals": `${breakdown.outsourcing_likelihood}/15 — ${breakdown.outsourcing_likelihood >= 11 ? "Strong outsourcing signals detected" : breakdown.outsourcing_likelihood >= 6 ? "Some outsourcing indicators" : "No clear outsourcing signals"}`,
    "Quality Gap": `${breakdown.quality_gap}/15 — ${breakdown.quality_gap >= 12 ? "Significant quality gap — high opportunity" : breakdown.quality_gap >= 8 ? "Moderate quality gap" : "Quality already high"}`,
    "Engagement Rate": `${breakdown.engagement_quality}/10 — ${breakdown.engagement_quality >= 8 ? "Excellent audience engagement" : breakdown.engagement_quality >= 4 ? "Average engagement" : "Low engagement"}`,
    "Content Consistency": `${breakdown.content_consistency}/5 — ${breakdown.content_consistency >= 4 ? "Consistent schedule and niche" : "Inconsistent posting or niche drift"}`,
  }
}
