import type { RecentVideoMetrics } from "@/types"

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"

// ─── API key rotation ────────────────────────────────────────────────────────
// Loads YOUTUBE_API_KEY, YOUTUBE_API_KEY_2, YOUTUBE_API_KEY_3 … from env.
// On a 403 (quota exceeded) the current key is blacklisted for the rest of
// the process lifetime and the next key is tried automatically.

function loadApiKeys(): string[] {
  const keys: string[] = []
  if (process.env.YOUTUBE_API_KEY) keys.push(process.env.YOUTUBE_API_KEY)
  for (let i = 2; i <= 10; i++) {
    const k = process.env[`YOUTUBE_API_KEY_${i}`]
    if (k) keys.push(k)
  }
  return keys
}

let _keys: string[] = []
let _keyIndex = 0

function getApiKey(): string {
  if (_keys.length === 0) _keys = loadApiKeys()
  if (_keys.length === 0) throw new Error("YouTube API key not configured")
  if (_keyIndex >= _keys.length) throw new Error("All YouTube API keys exhausted (quota exceeded)")
  return _keys[_keyIndex]
}

function rotateApiKey(): void {
  _keyIndex++
  if (_keyIndex < _keys.length) {
    console.warn(`[youtube] Key ${_keyIndex} quota exceeded — switching to key ${_keyIndex + 1}`)
  } else {
    console.error("[youtube] All API keys exhausted")
  }
}

// Drop-in replacement for fetch() on YouTube API URLs.
// Automatically appends the current key, retries once with the next key on 403.
async function youtubeApiFetch(url: URL): Promise<Response> {
  url.searchParams.set("key", getApiKey())
  let res = await fetch(url.toString())
  if (res.status === 403) {
    rotateApiKey()
    url.searchParams.set("key", getApiKey()) // throws if all exhausted
    res = await fetch(url.toString())
  }
  return res
}

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
  const query = params.keywords.join(" ")
  const url = new URL(`${YOUTUBE_API_BASE}/search`)
  url.searchParams.set("part", "snippet")
  url.searchParams.set("q", query)
  url.searchParams.set("type", "channel")
  url.searchParams.set("order", "relevance")
  url.searchParams.set("maxResults", String(params.maxResults ?? 30))
  if (params.regionCode) url.searchParams.set("regionCode", params.regionCode)
  if (params.relevanceLanguage) url.searchParams.set("relevanceLanguage", params.relevanceLanguage)

  const res = await youtubeApiFetch(url)
  if (!res.ok) throw new Error(`YouTube API error: ${res.statusText}`)
  const data = await res.json()

  return (data.items ?? []).map((item: YouTubeSearchResult) => ({
    channelId: item.snippet.channelId,
    title: item.snippet.title,
    description: item.snippet.description,
    thumbnailUrl: item.snippet.thumbnails?.default?.url,
  }))
}

// ─── Video search (returns unique channel IDs) ───────────────────────────────

export async function searchYouTubeVideos(params: {
  keywords: string[]
  maxResults?: number
  relevanceLanguage?: string
}): Promise<{ channelId: string; videoTitle: string }[]> {
  const query = params.keywords.join(" ")
  const url = new URL(`${YOUTUBE_API_BASE}/search`)
  url.searchParams.set("part", "snippet")
  url.searchParams.set("q", query)
  url.searchParams.set("type", "video")
  url.searchParams.set("order", "relevance")
  url.searchParams.set("videoDuration", "medium") // 4-20 min, filters out Shorts
  url.searchParams.set("maxResults", String(params.maxResults ?? 25))
  if (params.relevanceLanguage) url.searchParams.set("relevanceLanguage", params.relevanceLanguage)

  const res = await youtubeApiFetch(url)
  if (!res.ok) throw new Error(`YouTube API error: ${res.statusText}`)
  const data = await res.json()

  return (data.items ?? []).map((item: { snippet: { channelId: string; title: string } }) => ({
    channelId: item.snippet.channelId,
    videoTitle: item.snippet.title,
  }))
}

// ─── Faceless / stock-footage channel detection ────────────────────────────────

// Title patterns that strongly indicate faceless/voiceover content
const FACELESS_TITLE_PATTERNS = [
  /\btop\s+\d+\b/i,
  /\bcountdown\b/i,
  /\branked\b/i,
  /\bevery\b.{1,30}\bexplained\b/i,
  /\bhistory\s+of\b/i,
  /\bhow\s+\w+\s+works?\b/i,
  /\bwhy\s+\w/i,
  /\bbiggest\b/i,
  /\brichest\b/i,
  /\bmost\s+\w/i,
  /\bbest\s+\w/i,
  /\bworst\s+\w/i,
  /\bvs\.?\s+\w/i,
  /\bdocumentary\b/i,
  /\bfacts\s+about\b/i,
  /\binside\s+\w/i,
  /\bsecrets?\s+of\b/i,
  /\bcountries\s+(?:in|by|with|that)\b/i,
  /\bcities\s+(?:in|by|with|that)\b/i,
  /\beverything\s+(?:about|you|we)\b/i,
]

// Words in channel description that suggest a real person (vlogger/face cam)
const PERSONAL_SIGNALS = [
  "my channel", "my life", "my journey", "follow me", "join me", "i am a",
  "i'm a", "welcome to my", "about me", "my name is", "i create", "i make",
  "vlog", "vlogger", "daily life", "my family", "my kids", "my husband",
  "my wife", "my dog", "my cat", "face reveal", "i show my face",
]

export interface FacelessResult {
  score: number        // 0-100
  signals: string[]   // human-readable reasons
}

export function scoreFaceless(
  channelDescription: string | null,
  recentTitles: string[],
  metrics: RecentVideoMetrics
): FacelessResult {
  const signals: string[] = []
  let score = 0

  // 1. Title pattern analysis (strongest signal)
  const patternHits = recentTitles.filter((t) =>
    FACELESS_TITLE_PATTERNS.some((p) => p.test(t))
  )
  const patternRatio = recentTitles.length > 0 ? patternHits.length / recentTitles.length : 0

  if (patternRatio >= 0.6) {
    score += 40
    signals.push(`${patternHits.length}/${recentTitles.length} videos use list/documentary titles`)
  } else if (patternRatio >= 0.3) {
    score += 20
    signals.push(`${patternHits.length}/${recentTitles.length} videos have faceless-style titles`)
  }

  // 2. No personal language in description
  const descLower = (channelDescription ?? "").toLowerCase()
  const personalHits = PERSONAL_SIGNALS.filter((s) => descLower.includes(s))
  if (personalHits.length === 0) {
    score += 20
    signals.push("No personal/vlogger language in channel description")
  } else {
    score -= 15
    signals.push(`Personal signals found: ${personalHits.slice(0, 2).join(", ")}`)
  }

  // 3. Shorts ratio is low (faceless channels rarely do Shorts)
  if (metrics.shorts_pct <= 10) {
    score += 15
    signals.push("Low Shorts ratio — consistent long-form producer")
  } else if (metrics.shorts_pct >= 40) {
    score -= 10
    signals.push("High Shorts ratio — less likely faceless")
  }

  // 4. Long-form heavy
  if (metrics.long_form_pct >= 70) {
    score += 15
    signals.push(`${metrics.long_form_pct}% long-form content`)
  } else if (metrics.long_form_pct >= 50) {
    score += 8
  }

  // 5. Average video length sweet spot (8-20 min = stock/voiceover typical)
  const avgMin = metrics.avg_video_length_sec / 60
  if (avgMin >= 8 && avgMin <= 25) {
    score += 10
    signals.push(`Avg video length ${Math.round(avgMin)} min — typical faceless format`)
  }

  // Clamp
  const finalScore = Math.max(0, Math.min(100, score))

  if (finalScore >= 60 && signals.length === 0) {
    signals.push("Channel profile matches typical faceless/stock-footage channel")
  }

  return { score: finalScore, signals }
}

// ─── Channel details (batched, up to 50 ids) ──────────────────────────────────

export async function fetchChannelDetails(channelIds: string[]): Promise<RawChannel[]> {
  if (channelIds.length === 0) return []

  const out: RawChannel[] = []

  // channels.list accepts up to 50 ids per call
  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50)
    const url = new URL(`${YOUTUBE_API_BASE}/channels`)
    url.searchParams.set("part", "snippet,statistics,brandingSettings,contentDetails")
    url.searchParams.set("id", batch.join(","))
    url.searchParams.set("maxResults", "50")

    const res = await youtubeApiFetch(url)
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
  const playlistId =
    uploadsPlaylistId ??
    (channelId.startsWith("UC") ? "UU" + channelId.slice(2) : null)
  if (!playlistId) return []

  // 1) playlistItems -> recent video ids + publish dates
  const plUrl = new URL(`${YOUTUBE_API_BASE}/playlistItems`)
  plUrl.searchParams.set("part", "contentDetails")
  plUrl.searchParams.set("playlistId", playlistId)
  plUrl.searchParams.set("maxResults", String(maxResults))

  const plRes = await youtubeApiFetch(plUrl)
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

  const vRes = await youtubeApiFetch(vUrl)
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
      upload_trend: "unknown",
      upload_trend_pct: 0,
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

  // ── Upload trend: compare avg views of newer half vs older half ─────────────
  let upload_trend: RecentVideoMetrics["upload_trend"] = "unknown"
  let upload_trend_pct = 0

  if (sorted.length >= 4) {
    const half = Math.floor(sorted.length / 2)
    // sorted is newest-first, so sorted[0..half-1] are newer
    const newerHalf = sorted.slice(0, half)
    const olderHalf = sorted.slice(half)
    const newerAvg = newerHalf.reduce((s, v) => s + v.views, 0) / newerHalf.length
    const olderAvg = olderHalf.reduce((s, v) => s + v.views, 0) / olderHalf.length

    if (olderAvg > 0) {
      const pct = Math.round(((newerAvg - olderAvg) / olderAvg) * 100)
      upload_trend_pct = pct
      if (pct > 25) upload_trend = "growing"
      else if (pct < -25) upload_trend = "declining"
      else upload_trend = "stable"
    } else {
      upload_trend = "stable"
    }
  }

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
    upload_trend,
    upload_trend_pct,
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

// ─── "List video" channel mining ─────────────────────────────────────────────
// Search YouTube for "best/top [keywords] channels" compilation videos,
// then extract @handle mentions from their descriptions. These videos are
// human-curated channel lists — the highest quality discovery signal we have.

const HANDLE_RE = /@([\w.-]{3,})/g
const YOUTUBE_URL_HANDLE_RE = /youtube\.com\/@([\w.-]{3,})/g
const YOUTUBE_URL_CHANNEL_RE = /youtube\.com\/channel\/(UC[\w-]{10,})/g

export async function mineChannelsFromListVideos(
  keywords: string[],
  maxVideos = 5
): Promise<{ channelIds: string[]; handles: string[] }> {
  try { getApiKey() } catch { return { channelIds: [], handles: [] } }

  // Search for compilation/list videos about the topic
  const listQueries = [
    `best ${keywords.slice(0, 2).join(" ")} youtube channels`,
    `top ${keywords.slice(0, 2).join(" ")} channels to watch`,
  ]

  const foundHandles = new Set<string>()
  const foundChannelIds = new Set<string>()

  for (const query of listQueries) {
    try {
      const url = new URL(`${YOUTUBE_API_BASE}/search`)
      url.searchParams.set("part", "snippet")
      url.searchParams.set("q", query)
      url.searchParams.set("type", "video")
      url.searchParams.set("order", "relevance")
      url.searchParams.set("maxResults", String(maxVideos))

      const res = await youtubeApiFetch(url)
      if (!res.ok) continue
      const data = await res.json()
      const videoIds: string[] = (data.items ?? []).map(
        (item: { id: { videoId: string } }) => item.id.videoId
      ).filter(Boolean)

      if (videoIds.length === 0) continue

      // Fetch full video descriptions
      const vUrl = new URL(`${YOUTUBE_API_BASE}/videos`)
      vUrl.searchParams.set("part", "snippet")
      vUrl.searchParams.set("id", videoIds.join(","))

      const vRes = await youtubeApiFetch(vUrl)
      if (!vRes.ok) continue
      const vData = await vRes.json()

      for (const video of (vData.items ?? [])) {
        const desc: string = video.snippet?.description ?? ""
        const title: string = video.snippet?.title ?? ""
        const blob = `${title}\n${desc}`

        // Extract @handles from the description
        for (const match of blob.matchAll(HANDLE_RE)) {
          const handle = match[1].toLowerCase()
          if (handle.length >= 3 && handle.length <= 50) foundHandles.add(handle)
        }
        // Extract full youtube.com/@handle URLs
        for (const match of blob.matchAll(YOUTUBE_URL_HANDLE_RE)) {
          foundHandles.add(match[1].toLowerCase())
        }
        // Extract youtube.com/channel/UCxxx IDs directly
        for (const match of blob.matchAll(YOUTUBE_URL_CHANNEL_RE)) {
          foundChannelIds.add(match[1])
        }
      }
    } catch {
      // ignore failures for individual queries
    }
  }

  return {
    channelIds: [...foundChannelIds],
    handles: [...foundHandles].slice(0, 30), // cap to avoid too many lookups
  }
}

// Resolve @handles to channel IDs using YouTube channels.list?forHandle
export async function resolveHandlesToChannelIds(handles: string[]): Promise<string[]> {
  if (handles.length === 0) return []
  try { getApiKey() } catch { return [] }

  const channelIds: string[] = []

  // YouTube API only allows one handle per request, so batch with Promise.allSettled
  // but cap to avoid quota burn
  const capped = handles.slice(0, 20)
  const results = await Promise.allSettled(
    capped.map(async (handle) => {
      const url = new URL(`${YOUTUBE_API_BASE}/channels`)
      url.searchParams.set("part", "id")
      url.searchParams.set("forHandle", handle.startsWith("@") ? handle : `@${handle}`)
      const res = await youtubeApiFetch(url)
      if (!res.ok) return null
      const data = await res.json()
      return (data.items?.[0]?.id as string) ?? null
    })
  )

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) channelIds.push(r.value)
  }

  return channelIds
}

// ─── Transcript fetching ──────────────────────────────────────────────────────

/**
 * Fetch the auto-generated (or manual) transcript for a YouTube video.
 * Returns plain text, or null if no captions are available.
 *
 * Strategy:
 * 1. Fetch the watch page to extract ytInitialPlayerResponse JSON
 * 2. Parse captionTracks[0].baseUrl from the player response
 * 3. Fetch the caption XML and strip tags to plain text
 */
export async function fetchVideoTranscript(videoId: string): Promise<string | null> {
  try {
    // 1. Fetch the watch page
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    })
    if (!pageRes.ok) return null

    const html = await pageRes.text()

    // 2. Extract ytInitialPlayerResponse JSON
    const jsonMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})(?:;|\s*<\/script>)/)
    if (!jsonMatch) return null

    let playerResponse: Record<string, unknown>
    try {
      playerResponse = JSON.parse(jsonMatch[1])
    } catch {
      return null
    }

    // 3. Navigate to captionTracks
    const captionTracks = (
      playerResponse?.captions as Record<string, unknown> | undefined
    )?.playerCaptionsTracklistRenderer as Record<string, unknown> | undefined

    const tracks = captionTracks?.captionTracks as Array<{ baseUrl: string; languageCode?: string }> | undefined
    if (!tracks || tracks.length === 0) return null

    // Prefer English track, fall back to first available
    const track =
      tracks.find((t) => t.languageCode === "en" || t.languageCode?.startsWith("en")) ??
      tracks[0]

    if (!track?.baseUrl) return null

    // 4. Fetch the caption XML
    const captionRes = await fetch(track.baseUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    })
    if (!captionRes.ok) return null

    const xml = await captionRes.text()

    // 5. Parse <text> elements via regex (no DOM parser in edge runtime)
    const textParts: string[] = []
    const textRe = /<text[^>]*>([\s\S]*?)<\/text>/g
    let m: RegExpExecArray | null
    while ((m = textRe.exec(xml)) !== null) {
      textParts.push(m[1])
    }

    if (textParts.length === 0) return null

    // Decode HTML entities and join
    const raw = textParts.join(" ")
    const decoded = raw
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()

    return decoded.length > 0 ? decoded : null
  } catch {
    return null
  }
}

// ─── Comment fetching ──────────────────────────────────────────────────────────

export async function fetchVideoComments(videoId: string, maxResults = 25): Promise<string[]> {
  try { getApiKey() } catch { return [] }

  try {
    const url = new URL(`${YOUTUBE_API_BASE}/commentThreads`)
    url.searchParams.set("part", "snippet")
    url.searchParams.set("videoId", videoId)
    url.searchParams.set("maxResults", String(maxResults))
    url.searchParams.set("order", "relevance")

    const res = await youtubeApiFetch(url)
    if (!res.ok) return []
    const data = await res.json()

    return ((data.items ?? []) as Array<{
      snippet?: { topLevelComment?: { snippet?: { textDisplay?: string } } }
    }>)
      .map((item) => item.snippet?.topLevelComment?.snippet?.textDisplay ?? "")
      .filter(Boolean)
  } catch {
    return []
  }
}

// ─── Thumbnail URL helper ──────────────────────────────────────────────────────

export function getVideoThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
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
