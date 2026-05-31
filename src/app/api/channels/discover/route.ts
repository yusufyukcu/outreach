import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { searchYouTubeChannels, fetchChannelDetails, detectNiche } from "@/services/youtube"
import { scoreChannel } from "@/services/scoring"
import type { ServiceType } from "@/types"

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
    const { keywords, niche, min_subscribers, max_subscribers, service_type } = body as {
      keywords: string[]
      niche: string
      min_subscribers: number
      max_subscribers: number
      service_type: ServiceType
    }

    // Search YouTube
    const searchResults = await searchYouTubeChannels({ keywords, maxResults: 25 })
    const channelIds = searchResults.map(r => r.channelId).filter(Boolean)

    if (channelIds.length === 0) {
      return NextResponse.json({ channels: [], count: 0 })
    }

    // Fetch detailed channel data
    const channelDetails = await fetchChannelDetails(channelIds)

    // Filter by subscriber range
    const filtered = channelDetails.filter(ch =>
      (ch.subscriber_count ?? 0) >= min_subscribers &&
      (ch.subscriber_count ?? 0) <= max_subscribers
    )

    // Upsert channels + score them
    const results = []
    for (const ch of filtered) {
      if (!ch.youtube_channel_id) continue

      // Detect niche
      const detectedNiche = niche || detectNiche(ch.description ?? "", ch.name ?? "")

      const channelData = {
        ...ch,
        niche_primary: detectedNiche,
        outsourcing_likelihood_score: Math.floor(Math.random() * 60) + 20, // Placeholder
        editing_quality_score: Math.floor(Math.random() * 70) + 20,       // Placeholder
        thumbnail_quality_score: Math.floor(Math.random() * 70) + 20,     // Placeholder
        growth_trend_30d: (Math.random() * 25) - 2,                       // Placeholder
        upload_frequency_per_week: Math.random() * 5 + 0.5,               // Placeholder
        last_analyzed_at: new Date().toISOString(),
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: upserted, error } = await (supabase as any)
        .from("channels")
        .upsert(channelData, { onConflict: "youtube_channel_id" })
        .select()
        .single()

      if (error || !upserted) continue

      const breakdown = scoreChannel(upserted, service_type)
      results.push({ ...upserted, score: breakdown.total, score_breakdown: breakdown })
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score)

    return NextResponse.json({ channels: results, count: results.length })
  } catch (err) {
    console.error("Discovery error:", err)
    return NextResponse.json({ error: "Discovery failed" }, { status: 500 })
  }
}
