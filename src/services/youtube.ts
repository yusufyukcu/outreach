import type { RecentVideoMetrics } from "@/types"

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"

// ─── Raw API shapes ──────────────────────────────────────────────────────────

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
    channel?: { keywords?: string }
  }
  contentDetails?: {
    relatedPlaylists?: { uploads?: string }
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

interface YouTubeVideoItem {
  id: string
  snippet: { title: string; description: string; publishedAt: string }
  contentDetails: { duration: string }
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string }
}

// Rich channel shape returned by fetchChannelDetails (more than a DB Channel row)
export interface RawChannel {
  youtube_channel_id: string
  name: string
  handle: string | null
  description: string | null
  thumbnail_url: string | null
  country: string | null
  language: string | null
  subscriber_count: number
  total_view_count: number
  video_count: number
  published_at: string | null
  uploads_playlist_id: string | null
  keywords: string | null
}

// ─── Search ──────────────────────────────────────────────────────────────────

export async function searchYouTubeChannels(params: {
  keywords: string[]
  maxResults?: number
  regionCode?: string
  relevanceLanguage?: string
}): Promise<{ channelId: string; title: string; description: string; thumbnailUrl?: string }[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error("YouTube API key not configured")

  const query = params.keywords.join(" ")
  const url = new URL(`${YOUTUBE_API_BASE}/search`)
  url.searchParams.set("part", "snippet")
  url.searchParams.set("q", query)
  url.searchParams.set("type", "channel")
  url.searchParams.set("order", "relevance")
  url.searchParams.set("maxResults", String(params.maxResults ?? 30))
  if (params.regionCode) url.searchParams.set("regionCode", params.regionCode)
  if (params.relevanceLanguage) url.searchParams.set("relevanceLanguage", params.relevanceLanguage)
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

// ─── Channel details (batched, up to 50 ids) ──────────────────────────────────

export async function fetchChannelDetails(channelIds: string[]): Promise<RawChannel[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error("YouTube API key not configured")
  if (channelIds.length === 0) return []

  const out: RawChannel[] = []

  // channels.list accepts up to 50 ids per call
  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50)
    const url = new URL(`${YOUTUBE_API_BASE}/channels`)
    url.searchParams.set("part", "snippet,statistics,brandingSettings,contentDetails")
    url.searchParams.set("id", batch.join(","))
    url.searchParams.set("maxResults", "50")
    url.searchParams.set("key", apiKey)

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`YouTube API error: ${res.statusText}`)
    const data = await res.json()

    for (const item of (data.items ?? []) as YouTubeChannelItem[]) {
      out.push({
        youtube_channel_id: item.id,
        name: item.snippet.title,
        handle: item.snippet.customUrl ?? null,
        description: item.snippet.description ?? null,
        thumbnail_url: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.default?.url ?? null,
        country: item.snippet.country ?? null,
        language: item.snippet.defaultLanguage ?? null,
        subscriber_count: parseInt(item.statistics.subscriberCount || "0"),
        total_view_count: parseInt(item.statistics.viewCount || "0"),
        video_count: parseInt(item.statistics.videoCount || "0"),
        published_at: item.snippet.publishedAt ?? null,
        uploads_playlist_id: item.contentDetails?.relatedPlaylists?.uploads ?? null,
        keywords: item.brandingSettings?.channel?.keywords ?? null,
      })
    }
  }

  return out
}

// ─── Recent videos ────────────────────────────────────────────────────────────

export interface RecentVideo {
  id: string
  title: string
  description: string
  publishedAt: string
  durationSec: number
  views: number
}

/**
 * Fetch the most recent videos for a channel via its uploads playlist.
 * Falls back to deriving the uploads playlist id (UC… -> UU…) when missing.
 * Costs 2 quota units per channel (playlistItems + videos).
 */
export async function fetchRecentVideos(
  uploadsPlaylistId: string | null,
  channelId: string,
  maxResults = 15
): Promise<RecentVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error("YouTube API key not configured")

  const playlistId =
    uploadsPlaylistId ??
    (channelId.startsWith("UC") ? "UU" + channelId.slice(2) : null)
  if (!playlistId) return []

  // 1) playlistItems -> recent video ids + publish dates
  const plUrl = new URL(`${YOUTUBE_API_BASE}/playlistItems`)
  plUrl.searchParams.set("part", "contentDetails")
  plUrl.searchParams.set("playlistId", playlistId)
  plUrl.searchParams.set("maxResults", String(maxResults))
  plUrl.searchParams.set("key", apiKey)

  const plRes = await fetch(plUrl.toString())
  if (!plRes.ok) return []
  const plData = await plRes.json()
  const videoIds: string[] = (plData.items ?? [])
    .map((it: { contentDetails?: { videoId?: string } }) => it.contentDetails?.videoId)
    .filter(Boolean)
  if (videoIds.length === 0) return []

  // 2) videos.list -> duration, views, title, description
  const vUrl = new URL(`${YOUTUBE_API_BASE}/videos`)
  vUrl.searchParams.set("part", "snippet,contentDetails,statistics")
  vUrl.searchParams.set("id", videoIds.join(","))
  vUrl.searchParams.set("maxResults", String(maxResults))
  vUrl.searchParams.set("key", apiKey)

  const vRes = await fetch(vUrl.toString())
  if (!vRes.ok) return []
  const vData = await vRes.json()

  return ((vData.items ?? []) as YouTubeVideoItem[]).map((v) => ({
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description,
    publishedAt: v.snippet.publishedAt,
    durationSec: parseISO8601Duration(v.contentDetails.duration),
    views: parseInt(v.statistics?.viewCount || "0"),
  }))
}

// ─── Metric computation ────────────────────────────────────────────────────────

const LONG_FORM_THRESHOLD_SEC = 8 * 60 // 8 minutes
const SHORTS_THRESHOLD_SEC = 65        // <= ~60s counts as a Short

export function computeRecentMetrics(
  videos: RecentVideo[],
  subscriberCount: number
): RecentVideoMetrics {
  if (videos.length === 0) {
    return {
      last_upload_at: null,
      days_since_upload: null,
      avg_recent_views: 0,
      median_recent_views: 0,
      upload_frequency_per_week: 0,
      avg_video_length_sec: 0,
      long_form_pct: 0,
      shorts_pct: 0,
      engagement_ratio: 0,
      recent_video_count: 0,
      recent_titles: [],
    }
  }

  const sorted = [...videos].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )

  const lastUpload = sorted[0].publishedAt
  const oldest = sorted[sorted.length - 1].publishedAt
  const daysSinceUpload = Math.floor(
    (Date.now() - new Date(lastUpload).getTime()) / 86_400_000
  )

  const views = sorted.map((v) => v.views)
  const avgViews = Math.round(views.reduce((s, v) => s + v, 0) / views.length)
  const medianViews = median(views)

  const lengths = sorted.map((v) => v.durationSec)
  const avgLength = Math.round(lengths.reduce((s, v) => s + v, 0) / lengths.length)

  const longForm = sorted.filter((v) => v.durationSec >= LONG_FORM_THRESHOLD_SEC).length
  const shorts = sorted.filter((v) => v.durationSec > 0 && v.durationSec <= SHORTS_THRESHOLD_SEC).length

  // Upload frequency from the real publish span of recent videos
  const spanDays = Math.max(
    1,
    (new Date(lastUpload).getTime() - new Date(oldest).getTime()) / 86_400_000
  )
  const uploadsPerWeek = sorted.length > 1
    ? Math.round(((sorted.length - 1) / (spanDays / 7)) * 10) / 10
    : 0.5

  const engagementRatio = subscriberCount > 0
    ? Math.round((avgViews / subscriberCount) * 1000) / 1000
    : 0

  return {
    last_upload_at: lastUpload,
    days_since_upload: daysSinceUpload,
    avg_recent_views: avgViews,
    median_recent_views: medianViews,
    upload_frequency_per_week: uploadsPerWeek,
    avg_video_length_sec: avgLength,
    long_form_pct: Math.round((longForm / sorted.length) * 100),
    shorts_pct: Math.round((shorts / sorted.length) * 100),
    engagement_ratio: engagementRatio,
    recent_video_count: sorted.length,
    recent_titles: sorted.slice(0, 10).map((v) => v.title),
  }
}

// ─── Contact & language helpers ─────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const URL_RE = /(https?:\/\/[^\s)]+)|(\b(?:instagram|twitter|x|tiktok|linkedin|patreon|discord|twitch|facebook)\.com\/[^\s)]+)/i

export function extractBusinessEmail(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    if (!t) continue
    const m = t.match(EMAIL_RE)
    if (m) return m[0]
  }
  return null
}

export function hasExternalLinks(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && URL_RE.test(t))
}

export function detectSponsorship(...texts: (string | null | undefined)[]): boolean {
  const blob = texts.filter(Boolean).join(" ").toLowerCase()
  return [
    "sponsor", "sponsored", "use code", "promo code", "discount code",
    "thanks to", "brought to you by", "this video is sponsored",
    "check out", "/ref", "affiliate",
  ].some((kw) => blob.includes(kw))
}

/** Heuristic: is the text predominantly English / Latin script? */
export function looksEnglish(...texts: (string | null | undefined)[]): boolean {
  const blob = texts.filter(Boolean).join(" ")
  if (!blob) return true
  const letters = blob.replace(/[^\p{L}]/gu, "")
  if (letters.length < 8) return true
  const ascii = blob.replace(/[^a-zA-Z]/g, "").length
  return ascii / letters.length >= 0.6
}

// ─── Niche helpers ───────────────────────────────────────────────────────────

const NICHE_KEYWORDS: Record<string, string[]> = {
  Technology: ["tech", "technology", "software", "gadget", "review", "coding", "programming", "ai", "developer", "pc", "smartphone"],
  "Personal Finance": ["finance", "money", "invest", "investing", "stock", "stocks", "crypto", "budget", "wealth", "passive income", "real estate", "trading"],
  "Health & Fitness": ["fitness", "workout", "gym", "exercise", "health", "nutrition", "diet", "weight loss", "muscle", "training"],
  "Food & Cooking": ["food", "cook", "cooking", "recipe", "chef", "kitchen", "meal", "baking", "restaurant"],
  Gaming: ["gaming", "game", "gameplay", "playthrough", "esport", "streamer", "minecraft", "fortnite", "lets play"],
  "Travel & Vlogging": ["travel", "vlog", "vlogging", "adventure", "explore", "destination", "trip", "backpacking", "nomad"],
  "Beauty & Fashion": ["beauty", "makeup", "skincare", "fashion", "style", "outfit", "haul", "grwm"],
  Business: ["business", "entrepreneur", "startup", "marketing", "ecommerce", "saas", "agency", "freelance", "productivity", "side hustle"],
  Education: ["education", "learn", "tutorial", "how to", "course", "teach", "explained", "documentary", "history", "science"],
  Music: ["music", "song", "artist", "musician", "rap", "guitar", "piano", "beat", "album", "cover", "lyrics"],
  Comedy: ["comedy", "funny", "humor", "humour", "sketch", "prank", "meme", "memes", "reaction"],
  "News & Politics": ["news", "politics", "political", "world", "current events", "analysis", "breaking"],
  Sports: ["sports", "football", "soccer", "basketball", "nba", "nfl", "highlights", "athlete", "training"],
  "Real Estate": ["real estate", "property", "realtor", "housing", "mortgage", "rental", "airbnb"],
  Lifestyle: ["lifestyle", "minimalism", "self improvement", "motivation", "daily", "routine", "habits"],
}

const BAD_FIT_CATEGORIES = ["Music", "Gaming"] as const

/** Returns a niche-match ratio 0..1 based on description + recent titles + recent descriptions. */
export function nicheRelevanceRatio(
  niche: string,
  description: string | null,
  recentTitles: string[],
  recentDescriptions: string[]
): number {
  const keywords = NICHE_KEYWORDS[niche]
  if (!keywords) return 0.7 // unknown niche -> neutral-positive
  const blob = [description ?? "", ...recentTitles, ...recentDescriptions]
    .join(" ")
    .toLowerCase()
  if (!blob.trim()) return 0.3
  const hits = keywords.filter((kw) => blob.includes(kw)).length
  // 3+ distinct keyword hits is a confident match
  return Math.min(1, hits / 3)
}

/** Detect if a channel is clearly an off-target category (music / gaming / meme). */
export function detectOffTargetCategory(
  title: string,
  description: string | null,
  recentTitles: string[]
): string | null {
  const blob = `${title} ${description ?? ""} ${recentTitles.join(" ")}`.toLowerCase()
  for (const cat of BAD_FIT_CATEGORIES) {
    const kws = NICHE_KEYWORDS[cat]
    const hits = kws.filter((kw) => blob.includes(kw)).length
    if (hits >= 2) return cat
  }
  // meme-heavy
  const memeHits = ["meme", "memes", "tiktok compilation", "funny moments"].filter((kw) => blob.includes(kw)).length
  if (memeHits >= 2) return "Memes"
  return null
}

export function detectNiche(description: string, title: string): string {
  const text = `${title} ${description}`.toLowerCase()
  let best = "General"
  let bestHits = 0
  for (const [niche, kws] of Object.entries(NICHE_KEYWORDS)) {
    const hits = kws.filter((kw) => text.includes(kw)).length
    if (hits > bestHits) {
      bestHits = hits
      best = niche
    }
  }
  return bestHits > 0 ? best : "General"
}

// ─── Small math utilities ──────────────────────────────────────────────────────

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function parseISO8601Duration(iso: string): number {
  // e.g. PT1H2M30S, PT8M, PT45S
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  const h = parseInt(m[1] || "0")
  const min = parseInt(m[2] || "0")
  const s = parseInt(m[3] || "0")
  return h * 3600 + min * 60 + s
}

export function formatDuration(sec: number): string {
  if (sec <= 0) return "0:00"
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`
}
