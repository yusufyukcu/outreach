import type { Channel } from "@/types"

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"

interface YouTubeChannelItem {
  id: string
  snippet: {
    title: string
    description: string
    customUrl?: string
    thumbnails: { default?: { url: string }; medium?: { url: string }; high?: { url: string } }
    country?: string
    defaultLanguage?: string
    publishedAt: string
  }
  statistics: {
    subscriberCount: string
    viewCount: string
    videoCount: string
    hiddenSubscriberCount: boolean
  }
  brandingSettings?: {
    channel?: {
      keywords?: string
    }
  }
}

interface YouTubeSearchResult {
  id: { channelId: string }
  snippet: {
    channelId: string
    title: string
    description: string
    thumbnails: { default?: { url: string } }
  }
}

export async function searchYouTubeChannels(params: {
  keywords: string[]
  maxResults?: number
}): Promise<{ channelId: string; title: string; description: string; thumbnailUrl?: string }[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error("YouTube API key not configured")

  const query = params.keywords.join(" ")
  const url = new URL(`${YOUTUBE_API_BASE}/search`)
  url.searchParams.set("part", "snippet")
  url.searchParams.set("q", query)
  url.searchParams.set("type", "channel")
  url.searchParams.set("maxResults", String(params.maxResults ?? 25))
  url.searchParams.set("key", apiKey)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`YouTube API error: ${res.statusText}`)
  const data = await res.json()

  return (data.items ?? []).map((item: YouTubeSearchResult) => ({
    channelId: item.snippet.channelId,
    title: item.snippet.title,
    description: item.snippet.description,
    thumbnailUrl: item.snippet.thumbnails?.default?.url,
  }))
}

export async function fetchChannelDetails(channelIds: string[]): Promise<Partial<Channel>[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error("YouTube API key not configured")

  const url = new URL(`${YOUTUBE_API_BASE}/channels`)
  url.searchParams.set("part", "snippet,statistics,brandingSettings,contentDetails")
  url.searchParams.set("id", channelIds.join(","))
  url.searchParams.set("key", apiKey)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`YouTube API error: ${res.statusText}`)
  const data = await res.json()

  return (data.items ?? []).map((item: YouTubeChannelItem) => {
    const subs = parseInt(item.statistics.subscriberCount || "0")
    const views = parseInt(item.statistics.viewCount || "0")
    const videos = parseInt(item.statistics.videoCount || "0")

    // Estimate monthly revenue (CPM $3 avg for mid-tier channels)
    const estimatedMonthlyViews = subs * 0.08  // ~8% of subs watch monthly
    const revMin = Math.round((estimatedMonthlyViews / 1000) * 2)
    const revMax = Math.round((estimatedMonthlyViews / 1000) * 5)

    return {
      youtube_channel_id: item.id,
      name: item.snippet.title,
      handle: item.snippet.customUrl ?? null,
      description: item.snippet.description ?? null,
      thumbnail_url: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.default?.url ?? null,
      country: item.snippet.country ?? null,
      language: item.snippet.defaultLanguage ?? null,
      subscriber_count: subs,
      total_view_count: views,
      video_count: videos,
      estimated_monthly_revenue_min: revMin,
      estimated_monthly_revenue_max: revMax,
    } satisfies Partial<Channel>
  })
}

export function detectNiche(description: string, title: string): string {
  const text = `${title} ${description}`.toLowerCase()
  const nicheMap: [string[], string][] = [
    [["tech", "technology", "software", "gadget", "review", "coding", "programming"], "Technology"],
    [["finance", "money", "invest", "stock", "crypto", "budget", "wealth"], "Personal Finance"],
    [["fitness", "workout", "gym", "exercise", "health", "nutrition", "diet"], "Health & Fitness"],
    [["food", "cook", "recipe", "chef", "kitchen", "meal", "baking"], "Food & Cooking"],
    [["gaming", "game", "gameplay", "playthrough", "esport", "streamer"], "Gaming"],
    [["travel", "vlog", "adventure", "explore", "destination", "trip"], "Travel & Vlogging"],
    [["beauty", "makeup", "skincare", "fashion", "style", "outfit"], "Beauty & Fashion"],
    [["business", "entrepreneur", "startup", "marketing", "ecommerce", "saas"], "Business"],
    [["education", "learn", "tutorial", "how to", "course", "teach"], "Education"],
    [["music", "song", "artist", "musician", "rap", "guitar", "piano"], "Music"],
    [["comedy", "funny", "humor", "sketch", "prank", "meme"], "Comedy"],
    [["news", "politics", "world", "current events", "analysis"], "News & Politics"],
  ]

  for (const [keywords, niche] of nicheMap) {
    if (keywords.some(kw => text.includes(kw))) return niche
  }
  return "General"
}

export function estimateUploadFrequency(videoCount: number, channelAgeMonths: number): number {
  if (channelAgeMonths <= 0) return 1
  const videosPerMonth = videoCount / channelAgeMonths
  return Math.round((videosPerMonth / 4) * 10) / 10 // per week
}
