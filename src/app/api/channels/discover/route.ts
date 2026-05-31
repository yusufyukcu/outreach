import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  searchYouTubeChannels,
  fetchChannelDetails,
  fetchRecentVideos,
  computeRecentMetrics,
  extractBusinessEmail,
  hasExternalLinks,
  detectSponsorship,
  looksEnglish,
  nicheRelevanceRatio,
  detectOffTargetCategory,
  detectNiche,
  type RecentVideo,
} from "@/services/youtube"
import { evaluateLead } from "@/services/lead-quality"
import { expandKeywords, computeSemanticRelevance } from "@/services/keyword-expansion"
import type { DiscoveredLead, ServiceType } from "@/types"

// Deep analysis is quota-heavy (2 units/channel), so cap how many we inspect.
const MAX_DEEP_ANALYZE = 20

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single() as { data: { org_id: string } | null }

    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 400 })

    const body = await req.json()
    const {
      keywords,
      niche,
      min_subscribers,
      max_subscribers,
      service_type,
      min_score = 75,
      include_low_quality = false,
      english_only = true,
      min_recent_views = 2000,
    } = body as {
      keywords: string[]
      niche: string
      min_subscribers: number
      max_subscribers: number
      service_type: ServiceType
      min_score?: number
      include_low_quality?: boolean
      english_only?: boolean
      min_recent_views?: number
    }

    const nicheSelected = !!niche && niche !== "Any Niche"

    // 1) Expand keywords semantically via AI, then search with all concepts
    const expansion = await expandKeywords(keywords, service_type)
    const allConcepts = expansion.all   // original + AI-generated

    // Search in parallel using original keywords + expanded concepts (batched into groups of 3)
    const searchGroups: string[][] = []
    // Always search original keywords as one query
    searchGroups.push(keywords)
    // Add expanded concepts in pairs to avoid quota waste
    for (let i = 0; i < expansion.expanded.length; i += 2) {
      searchGroups.push(expansion.expanded.slice(i, i + 2))
    }
    // Cap to 5 search queries total
    const cappedGroups = searchGroups.slice(0, 5)

    const searchResultArrays = await Promise.allSettled(
      cappedGroups.map((group) =>
        searchYouTubeChannels({
          keywords: group,
          maxResults: 15,
          relevanceLanguage: english_only ? "en" : undefined,
        })
      )
    )

    const allSearchResults = searchResultArrays
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))

    const channelIds = [...new Set(allSearchResults.map((r) => r.channelId).filter(Boolean))]
    if (channelIds.length === 0) return NextResponse.json({ channels: [], count: 0, analyzed: 0, expanded_concepts: allConcepts })

    // 2) Channel details (batched)
    const details = await fetchChannelDetails(channelIds)

    // 3) Subscriber-range pre-filter, then cap deep analysis
    const candidates = details
      .filter((c) => c.subscriber_count >= min_subscribers && c.subscriber_count <= max_subscribers)
      .sort((a, b) => b.subscriber_count - a.subscriber_count)
      .slice(0, MAX_DEEP_ANALYZE)

    // 4) Deep-analyze each candidate (recent videos -> metrics -> score)
    const evaluated = await Promise.all(
      candidates.map(async (c) => {
        let videos: RecentVideo[] = []
        try {
          videos = await fetchRecentVideos(c.uploads_playlist_id, c.youtube_channel_id, 15)
        } catch {
          videos = []
        }

        const metrics = computeRecentMetrics(videos, c.subscriber_count)
        const recentDescriptions = videos.map((v) => v.description)

        const detectedNiche = nicheSelected
          ? niche
          : detectNiche(c.description ?? "", c.name)

        const businessEmail = extractBusinessEmail(
          c.description,
          ...recentDescriptions
        )
        const links = hasExternalLinks(c.description, ...recentDescriptions)
        const sponsorship = detectSponsorship(c.description, ...recentDescriptions, ...metrics.recent_titles)
        const isEnglish = looksEnglish(c.name, c.description, ...metrics.recent_titles)

        const nicheRatio = nicheRelevanceRatio(
          nicheSelected ? niche : detectedNiche,
          c.description,
          metrics.recent_titles,
          recentDescriptions
        )
        const offTarget = detectOffTargetCategory(c.name, c.description, metrics.recent_titles)

        const result = evaluateLead({
          metrics,
          subscriberCount: c.subscriber_count,
          nicheSelected,
          nicheRatio,
          offTargetCategory: offTarget,
          isEnglish,
          englishOnly: english_only,
          businessEmail,
          hasLinks: links,
          sponsorshipDetected: sponsorship,
          minRecentViews: min_recent_views,
        })

        // Semantic relevance: scored against AI-expanded concepts, NOT channel name
        const relevance = computeSemanticRelevance(
          allConcepts,
          c.description,
          metrics.recent_titles,
          recentDescriptions,
        )

        return { channel: c, metrics, businessEmail, links, sponsorship, detectedNiche, result, relevance }
      })
    )

    // 5) Drop hard-excluded, then persist survivors + score floor
    const threshold = include_low_quality ? 0 : min_score
    const leads: DiscoveredLead[] = []

    for (const e of evaluated) {
      if (e.result.excluded) continue
      if (e.result.score < threshold) continue

      const c = e.channel
      const channelRow = {
        youtube_channel_id: c.youtube_channel_id,
        name: c.name,
        handle: c.handle,
        description: c.description,
        thumbnail_url: c.thumbnail_url,
        country: c.country,
        language: c.language,
        niche_primary: e.detectedNiche,
        subscriber_count: c.subscriber_count,
        total_view_count: c.total_view_count,
        video_count: c.video_count,
        avg_views_30d: e.metrics.avg_recent_views || null,
        upload_frequency_per_week: e.metrics.upload_frequency_per_week || null,
        last_upload_at: e.metrics.last_upload_at,
        sponsorship_detected: e.sponsorship,
        analysis_summary: e.result.reasoning,
        last_analyzed_at: new Date().toISOString(),
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: upserted } = await (supabase as any)
        .from("channels")
        .upsert(channelRow, { onConflict: "youtube_channel_id" })
        .select()
        .single()

      // Persist contact info if we found an email
      if (upserted?.id && (e.businessEmail || e.links)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("contacts")
          .upsert(
            {
              channel_id: upserted.id,
              email: e.businessEmail,
              email_verified: false,
              email_confidence_score: e.businessEmail ? 60 : 0,
            },
            { onConflict: "channel_id" }
          )
      }

      leads.push({
        id: upserted?.id,
        youtube_channel_id: c.youtube_channel_id,
        name: c.name,
        handle: c.handle,
        description: c.description,
        thumbnail_url: c.thumbnail_url,
        country: c.country,
        language: c.language,
        niche_primary: e.detectedNiche,
        subscriber_count: c.subscriber_count,
        total_view_count: c.total_view_count,
        video_count: c.video_count,
        metrics: e.metrics,
        business_email: e.businessEmail,
        has_links: e.links,
        sponsorship_detected: e.sponsorship,
        score: e.result.score,
        quality_breakdown: e.result.breakdown,
        badges: e.result.badges,
        warnings: e.result.warnings,
        reasoning: e.result.reasoning,
        relevance_score: e.relevance.score,
        relevance_explanation: e.relevance.explanation,
        expanded_concepts: allConcepts,
      })
    }

    // 6) Default sort by score (client can re-sort)
    leads.sort((a, b) => b.score - a.score)

    return NextResponse.json({
      channels: leads,
      count: leads.length,
      analyzed: evaluated.length,
      excluded: evaluated.filter((e) => e.result.excluded).length,
      expanded_concepts: allConcepts,
      original_keywords: keywords,
    })
  } catch (err) {
    console.error("Discovery error:", err)
    return NextResponse.json({ error: "Discovery failed" }, { status: 500 })
  }
}
