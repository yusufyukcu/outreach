import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  searchYouTubeVideos,
  mineChannelsFromListVideos,
  resolveHandlesToChannelIds,
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
  scoreFaceless,
  fetchVideoComments,
  type RecentVideo,
} from "@/services/youtube"
import { evaluateLead, applyEditingAnalysis } from "@/services/lead-quality"
import { analyzeEditingQuality, geminiConfigured, pickEditingVideo, EDITING_QUALITY_MODEL } from "@/services/editing-quality"
import { expandKeywords, computeSemanticRelevance, KEYWORD_EXPANSION_MODEL } from "@/services/keyword-expansion"
import { analyzeCommentSignals, COMMENT_SIGNALS_MODEL, type CommentSignalResult } from "@/services/comment-signals"
import { analyzeThumbnails, THUMBNAIL_MODEL, type ThumbnailQualityResult } from "@/services/thumbnail-quality"
import { analyzeTranscript, TRANSCRIPT_MODEL, type TranscriptAnalysisResult } from "@/services/transcript-analysis"
import { fetchVideoTranscript } from "@/services/youtube"
import { buildWonProfile, scoreAgainstWonProfile, type WonProfile } from "@/services/won-profile"
import { recordResearchEvents, analysisSucceeded, type ResearchEvent } from "@/services/research"
import type { DiscoveredLead, EditingAnalysis, ServiceType } from "@/types"

// Deep analysis costs 2 quota units per channel (playlistItems + videos.list)
const MAX_DEEP_ANALYZE = 30
// Gemini video reviews per request (~1 Flash call each, up to ~2 min) — top candidates only
const MAX_EDITING_REVIEWS = 5

export async function POST(req: NextRequest) {
  try {
    const startedAt = Date.now()
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
      min_score = 60,
      include_low_quality = false,
      english_only = true,
      min_recent_views = 1000,
      faceless_mode = false,
      min_faceless_score = 50,
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
      faceless_mode?: boolean
      min_faceless_score?: number
    }

    const nicheSelected = !!niche && niche !== "Any Niche"

    // ── Step 0: Build won profile from past won leads ────────────────────────────
    let wonProfile: WonProfile | null = null
    try {
      const { data: wonLeads } = await supabase
        .from("leads")
        .select("channel_id")
        .eq("org_id", profile.org_id)
        .eq("crm_stage", "won")

      if (wonLeads && wonLeads.length >= 3) {
        const wonChannelIds = wonLeads.map((l: { channel_id: string }) => l.channel_id).filter(Boolean)
        const { data: wonChannelRows } = await supabase
          .from("channels")
          .select("subscriber_count, avg_views_30d, upload_frequency_per_week, long_form_pct_approx")
          .in("id", wonChannelIds)

        if (wonChannelRows && wonChannelRows.length >= 3) {
          wonProfile = buildWonProfile(wonChannelRows.map((ch: {
            subscriber_count: number
            avg_views_30d: number | null
            upload_frequency_per_week: number | null
            long_form_pct_approx: number | null
          }) => ({
            subscriber_count: ch.subscriber_count ?? 0,
            engagement_ratio: 0,
            upload_freq: ch.upload_frequency_per_week ?? 0,
            long_form_pct: ch.long_form_pct_approx ?? 0,
            median_views: ch.avg_views_30d ?? 0,
          })))
        }
      }
    } catch {
      // won profile is optional, ignore errors
    }

    // ── Step 1: Semantic keyword expansion ──────────────────────────────────────
    const expansion = await expandKeywords(keywords, service_type)
    const allConcepts = expansion.all

    // Build search groups: original keywords + expanded concepts in pairs
    const searchGroups: string[][] = [keywords]
    for (let i = 0; i < expansion.expanded.length; i += 2) {
      searchGroups.push(expansion.expanded.slice(i, i + 2))
    }
    const cappedGroups = searchGroups.slice(0, 6)

    // ── Step 2: Always search VIDEOS (not channels) ─────────────────────────────
    // Video search surfaces channels that actually MAKE content about the topic,
    // not just channels named after the keyword. This matches how manual search works.
    const videoResultArrays = await Promise.allSettled(
      cappedGroups.map((group) =>
        searchYouTubeVideos({
          keywords: group,
          maxResults: 20,
          relevanceLanguage: english_only ? "en" : undefined,
        })
      )
    )

    // ── Step 3: Mine channels from "best X channels" list videos ────────────────
    // YouTube creators publish "Top 10 channels about X" videos — these are
    // human-curated lists. We extract @handle mentions from their descriptions.
    // Run in parallel with video search to avoid latency hit.
    const listMinePromise = mineChannelsFromListVideos(keywords, 5)

    // ── Step 4: Count search hit frequency per channel ───────────────────────────
    // A channel appearing in 4 out of 6 queries is more relevant than one in 1.
    // This replaces "sort by subscriber count" as the primary ranking signal.
    const channelHits = new Map<string, number>()
    for (const result of videoResultArrays) {
      if (result.status !== "fulfilled") continue
      const seen = new Set<string>()
      for (const r of result.value) {
        if (!r.channelId || seen.has(r.channelId)) continue
        seen.add(r.channelId)
        channelHits.set(r.channelId, (channelHits.get(r.channelId) ?? 0) + 1)
      }
    }
    // Research logging only: channels found by keyword search, before list-mined ones are merged in
    const videoSearchIds = new Set(channelHits.keys())

    // Merge list-mined channels — give them a base frequency of 2
    // (manually curated > single search hit, but less than multi-hit)
    const { channelIds: minedIds, handles: minedHandles } = await listMinePromise
    const resolvedHandleIds = await resolveHandlesToChannelIds(minedHandles)
    const allMinedIds = [...new Set([...minedIds, ...resolvedHandleIds])]
    for (const id of allMinedIds) {
      if (!channelHits.has(id)) channelHits.set(id, 2)
    }

    const channelIds = [...channelHits.keys()]

    // Research logging: one discovery_run event per request (funnel + settings)
    let secondPassSearches = 0
    const runEvent = (funnel: Record<string, unknown>): ResearchEvent => ({
      org_id: profile.org_id,
      event_type: "discovery_run",
      payload: {
        service_type,
        niche: nicheSelected ? niche : null,
        keywords,
        params: { min_subscribers, max_subscribers, min_score, include_low_quality, english_only, min_recent_views, faceless_mode, min_faceless_score },
        expanded_concepts: expansion.expanded.length,
        won_profile_active: wonProfile !== null,
        searches: { video_search_groups: cappedGroups.length, second_pass: secondPassSearches },
        funnel: {
          from_video_search: videoSearchIds.size,
          from_list_mining: allMinedIds.length,
          list_mining_only: allMinedIds.filter((id) => !videoSearchIds.has(id)).length,
          unique_channels: channelIds.length,
          ...funnel,
        },
        models: {
          keyword_expansion: KEYWORD_EXPANSION_MODEL,
          comments: COMMENT_SIGNALS_MODEL,
          thumbnails: THUMBNAIL_MODEL,
          transcript: TRANSCRIPT_MODEL,
          editing: geminiConfigured() ? EDITING_QUALITY_MODEL : null,
        },
        duration_ms: Date.now() - startedAt,
      },
    })

    if (channelIds.length === 0) {
      await recordResearchEvents(supabase, [runEvent({ returned: 0 })])
      return NextResponse.json({ channels: [], count: 0, analyzed: 0, expanded_concepts: allConcepts })
    }

    // ── Step 4: Fetch channel details ───────────────────────────────────────────
    const details = await fetchChannelDetails(channelIds)

    // ── Step 5: Pre-filter by subscriber range, rank by hit frequency ────────────
    // Primary sort: how many search queries surfaced this channel (relevance)
    // Secondary sort: subscriber count (larger = more established)
    const candidates = details
      .filter((c) => c.subscriber_count >= min_subscribers && c.subscriber_count <= max_subscribers)
      .sort((a, b) => {
        const hitDiff = (channelHits.get(b.youtube_channel_id) ?? 0) - (channelHits.get(a.youtube_channel_id) ?? 0)
        if (hitDiff !== 0) return hitDiff
        return b.subscriber_count - a.subscriber_count
      })
      .slice(0, MAX_DEEP_ANALYZE)

    // ── Step 6: Deep-analyze each candidate ─────────────────────────────────────
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

        const businessEmail = extractBusinessEmail(c.description, ...recentDescriptions)
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

        const relevance = computeSemanticRelevance(
          allConcepts,
          c.description,
          metrics.recent_titles,
          recentDescriptions,
        )

        const faceless = scoreFaceless(c.description, metrics.recent_titles, metrics)
        const searchHits = channelHits.get(c.youtube_channel_id) ?? 1

        return { channel: c, videos, metrics, businessEmail, links, sponsorship, detectedNiche, result, relevance, faceless, searchHits }
      })
    )

    // ── Step 7: Auto second-pass from top-scoring seed channels ─────────────────
    // Take the 3 best channels from round 1 (score ≥ 65, not excluded).
    // Use their recent video titles as new search queries to find similar channels
    // that didn't appear in the original search — fully automatic, no user input.
    const alreadyAnalyzed = new Set(candidates.map((c) => c.youtube_channel_id))

    const seeds = evaluated
      .filter((e) => !e.result.excluded && e.result.score >= 65)
      .sort((a, b) => b.result.score - a.result.score)
      .slice(0, 3)

    const secondPassIds = new Set<string>()
    if (seeds.length > 0) {
      // Build search terms from seed video titles: pick titles that look like
      // content titles (not "Q&A", "vlog", personal stuff)
      const seedTerms: string[] = []
      for (const seed of seeds) {
        const goodTitles = seed.metrics.recent_titles
          .filter((t) => t.length > 15 && !/\b(q&a|vlog|day in|my life|storytime)\b/i.test(t))
          .slice(0, 2)
        seedTerms.push(...goodTitles)
      }

      if (seedTerms.length > 0) {
        const seedSearchResults = await Promise.allSettled(
          seedTerms.slice(0, 4).map((term) =>
            searchYouTubeVideos({
              keywords: [term],
              maxResults: 15,
              relevanceLanguage: english_only ? "en" : undefined,
            })
          )
        )
        secondPassSearches = seedSearchResults.length

        const newChannelIds = new Set<string>()
        for (const r of seedSearchResults) {
          if (r.status !== "fulfilled") continue
          for (const v of r.value) {
            if (v.channelId && !alreadyAnalyzed.has(v.channelId)) {
              newChannelIds.add(v.channelId)
            }
          }
        }

        if (newChannelIds.size > 0) {
          const newDetails = await fetchChannelDetails([...newChannelIds])
          const newCandidates = newDetails
            .filter((c) => c.subscriber_count >= min_subscribers && c.subscriber_count <= max_subscribers)
            .slice(0, 15) // cap second-pass to avoid quota burn
          for (const c of newCandidates) secondPassIds.add(c.youtube_channel_id)

          const secondPassEvaluated = await Promise.all(
            newCandidates.map(async (c) => {
              let videos: RecentVideo[] = []
              try { videos = await fetchRecentVideos(c.uploads_playlist_id, c.youtube_channel_id, 15) } catch { /* */ }
              const metrics = computeRecentMetrics(videos, c.subscriber_count)
              const recentDescriptions = videos.map((v) => v.description)
              const detectedNiche = nicheSelected ? niche : detectNiche(c.description ?? "", c.name)
              const businessEmail = extractBusinessEmail(c.description, ...recentDescriptions)
              const links = hasExternalLinks(c.description, ...recentDescriptions)
              const sponsorship = detectSponsorship(c.description, ...recentDescriptions, ...metrics.recent_titles)
              const isEnglish = looksEnglish(c.name, c.description, ...metrics.recent_titles)
              const nicheRatio = nicheRelevanceRatio(nicheSelected ? niche : detectedNiche, c.description, metrics.recent_titles, recentDescriptions)
              const offTarget = detectOffTargetCategory(c.name, c.description, metrics.recent_titles)
              const result = evaluateLead({ metrics, subscriberCount: c.subscriber_count, nicheSelected, nicheRatio, offTargetCategory: offTarget, isEnglish, englishOnly: english_only, businessEmail, hasLinks: links, sponsorshipDetected: sponsorship, minRecentViews: min_recent_views })
              const relevance = computeSemanticRelevance(allConcepts, c.description, metrics.recent_titles, recentDescriptions)
              const faceless = scoreFaceless(c.description, metrics.recent_titles, metrics)
              return { channel: c, videos, metrics, businessEmail, links, sponsorship, detectedNiche, result, relevance, faceless, searchHits: 1 }
            })
          )

          evaluated.push(...secondPassEvaluated)
        }
      }
    }

    // ── Step 8: Apply filters and persist ───────────────────────────────────────
    const qualityThreshold = include_low_quality ? 0 : min_score

    // Fetch channel_ids already in this org's leads so we can exclude them
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("channel_id, channel:channels(youtube_channel_id)")
      .eq("org_id", profile.org_id)
    const existingChannelIds = new Set((existingLeads ?? []).map((l) => l.channel_id).filter(Boolean))
    const existingYoutubeIds = new Set(
      (existingLeads ?? []).map((l) => (l.channel as { youtube_channel_id?: string } | null)?.youtube_channel_id).filter(Boolean),
    )

    // ── Phase 2: Comment + thumbnail analysis (only for channels that pass quality) ──
    // Run in parallel per channel to avoid blocking on sequential API calls
    type Phase2Result = {
      comment_signals: CommentSignalResult | null
      thumbnail_quality: ThumbnailQualityResult | null
      transcript_analysis: TranscriptAnalysisResult | null
      won_similarity: number | null
      editing_analysis: EditingAnalysis | null
      editing_reused: boolean
    }
    const phase2Map = new Map<string, Phase2Result>()

    const phase2Candidates = evaluated.filter((e) => {
      if (e.result.excluded) return false
      if (e.result.score < qualityThreshold) return false
      if (faceless_mode && e.faceless.score < min_faceless_score) return false
      return true
    })

    // Research logging: heuristic faceless score before vision/transcript correction,
    // and the quality score before the editing review is blended in
    const facelessHeuristic = new Map(evaluated.map((e) => [e.channel.youtube_channel_id, e.faceless.score]))
    const baseQualityScore = new Map(evaluated.map((e) => [e.channel.youtube_channel_id, e.result.score]))

    // ── Editing review (Gemini): latest long-form video of the top candidates ────
    // Editing services only. Channels already in the pipeline are skipped, and a
    // stored review of the same video is reused instead of paying for a new one.
    const editingTargets = new Set(
      service_type === "editing" && geminiConfigured()
        ? phase2Candidates
            .filter((e) => !existingYoutubeIds.has(e.channel.youtube_channel_id) && pickEditingVideo(e.videos))
            .sort((a, b) => b.result.score - a.result.score)
            .slice(0, MAX_EDITING_REVIEWS)
            .map((e) => e.channel.youtube_channel_id)
        : [],
    )
    const storedEditing = new Map<string, EditingAnalysis>()
    if (editingTargets.size > 0) {
      // Fails quietly (no reuse) until migration 0005 adds channels.editing_analysis
      const { data: storedRows } = await supabase
        .from("channels")
        .select("youtube_channel_id, editing_analysis")
        .in("youtube_channel_id", [...editingTargets])
      for (const row of storedRows ?? []) {
        if (row.editing_analysis) storedEditing.set(row.youtube_channel_id, row.editing_analysis as EditingAnalysis)
      }
    }

    await Promise.allSettled(
      phase2Candidates.map(async (e) => {
        const cid = e.channel.youtube_channel_id
        const videoIds = e.videos.slice(0, 4).map((v) => v.id)
        const mostRecentVideoId = e.videos[0]?.id ?? null

        const commentPromise: Promise<CommentSignalResult | null> = mostRecentVideoId
          ? fetchVideoComments(mostRecentVideoId, 25).then((comments) =>
              analyzeCommentSignals(e.channel.name, service_type, comments)
            ).catch(() => null)
          : Promise.resolve(null)

        // Pass 6 video IDs so vision gets more thumbnails for better face detection accuracy
        const thumbnailVideoIds = e.videos.slice(0, 6).map((v) => v.id)
        const thumbnailPromise: Promise<ThumbnailQualityResult | null> = thumbnailVideoIds.length > 0
          ? analyzeThumbnails(e.channel.name, service_type, thumbnailVideoIds).catch(() => null)
          : Promise.resolve(null)

        const transcriptPromise: Promise<TranscriptAnalysisResult | null> = mostRecentVideoId
          ? fetchVideoTranscript(mostRecentVideoId)
              .then((transcript) =>
                transcript
                  ? analyzeTranscript(e.channel.name, service_type, transcript)
                  : null
              )
              .catch(() => null)
          : Promise.resolve(null)

        const editingVideo = editingTargets.has(cid) ? pickEditingVideo(e.videos) : null
        const storedReview = storedEditing.get(cid)
        const editingReused = !!editingVideo && storedReview?.video_id === editingVideo.id
        const editingPromise: Promise<EditingAnalysis | null> = !editingVideo
          ? Promise.resolve(null)
          : editingReused
          ? Promise.resolve(storedReview ?? null)
          : analyzeEditingQuality(editingVideo).catch(() => null)

        const [commentResult, thumbnailResult, transcriptResult, editingResult] = await Promise.all([commentPromise, thumbnailPromise, transcriptPromise, editingPromise])

        // ── Editing review → lead score (15% weight; unchanged when not reviewed) ──
        if (editingResult) e.result = applyEditingAnalysis(e.result, editingResult.editing_quality)

        // ── Vision-corrected faceless score ─────────────────────────────────────
        // If AI detected a consistent face in thumbnails with high confidence,
        // override the text-based faceless score downward — it's clearly not faceless.
        // If no face detected with high confidence, boost the score.
        if (thumbnailResult && thumbnailResult.face_confidence >= 60) {
          if (thumbnailResult.face_detected) {
            // Face confirmed → hard cap at 20 (not faceless)
            e.faceless.score = Math.min(e.faceless.score, 20)
            e.faceless.signals = [
              thumbnailResult.face_signal,
              ...e.faceless.signals.filter((s) => !s.toLowerCase().includes("title")),
            ].slice(0, 3)
          } else {
            // No face confirmed → boost score (minimum 55 if confidence ≥ 75)
            if (thumbnailResult.face_confidence >= 75) {
              e.faceless.score = Math.max(e.faceless.score, 55)
            }
            e.faceless.signals = [
              thumbnailResult.face_signal,
              ...e.faceless.signals,
            ].slice(0, 3)
          }
        }

        // ── Transcript-corrected faceless score ──────────────────────────────────
        if (transcriptResult && transcriptResult.faceless_confidence >= 65) {
          if (transcriptResult.is_faceless) {
            e.faceless.score = Math.max(e.faceless.score, 60)
          } else {
            e.faceless.score = Math.min(e.faceless.score, 25)
          }
          e.faceless.signals = [
            transcriptResult.faceless_signal,
            ...e.faceless.signals,
          ].slice(0, 3)
        }

        const won_similarity = wonProfile
          ? scoreAgainstWonProfile(
              e.channel.subscriber_count,
              e.metrics.engagement_ratio,
              e.metrics.upload_frequency_per_week,
              e.metrics.long_form_pct,
              e.metrics.median_recent_views,
              wonProfile
            )
          : null

        phase2Map.set(cid, {
          comment_signals: commentResult,
          thumbnail_quality: thumbnailResult,
          transcript_analysis: transcriptResult,
          won_similarity,
          editing_analysis: editingResult,
          editing_reused: editingReused && !!editingResult,
        })
      })
    )

    const leads: DiscoveredLead[] = []
    const signalEvents: ResearchEvent[] = []
    let alreadyInPipeline = 0

    for (const e of evaluated) {
      if (e.result.excluded) continue
      if (e.result.score < qualityThreshold) continue
      if (faceless_mode && e.faceless.score < min_faceless_score) continue

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

      // Skip channels already in this org's leads pipeline
      if (upserted?.id && existingChannelIds.has(upserted.id)) {
        alreadyInPipeline++
        continue
      }

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

      // Store a fresh editing review on the channel (separate update, so the
      // upsert above keeps working before migration 0005 adds editing_analysis)
      const p2 = phase2Map.get(c.youtube_channel_id)
      if (upserted?.id && p2?.editing_analysis && !p2.editing_reused) {
        const { error: editingError } = await supabase
          .from("channels")
          .update({ editing_quality_score: p2.editing_analysis.editing_quality, editing_analysis: p2.editing_analysis })
          .eq("id", upserted.id)
        if (editingError) console.warn("[editing-quality] Could not store review:", editingError.message)
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
        faceless_score: e.faceless.score,
        faceless_signals: e.faceless.signals,
        thumbnail_quality: phase2Map.get(c.youtube_channel_id)?.thumbnail_quality ?? null,
        comment_signals: phase2Map.get(c.youtube_channel_id)?.comment_signals ?? null,
        won_similarity: phase2Map.get(c.youtube_channel_id)?.won_similarity ?? null,
        transcript_analysis: phase2Map.get(c.youtube_channel_id)?.transcript_analysis ?? null,
        editing_analysis: p2?.editing_analysis ?? null,
      })

      // Research logging: signals as known at discovery time (scores only, no text)
      signalEvents.push({
        org_id: profile.org_id,
        event_type: "lead_signals",
        channel_id: upserted?.id ?? null,
        payload: {
          youtube_channel_id: c.youtube_channel_id,
          service_type,
          niche: e.detectedNiche,
          subscriber_count: c.subscriber_count,
          video_count: c.video_count,
          source: {
            video_search: videoSearchIds.has(c.youtube_channel_id),
            list_mining: allMinedIds.includes(c.youtube_channel_id),
            second_pass: secondPassIds.has(c.youtube_channel_id),
            search_hits: e.searchHits,
          },
          metrics: {
            days_since_upload: e.metrics.days_since_upload,
            median_recent_views: e.metrics.median_recent_views,
            avg_recent_views: e.metrics.avg_recent_views,
            upload_frequency_per_week: e.metrics.upload_frequency_per_week,
            avg_video_length_sec: e.metrics.avg_video_length_sec,
            long_form_pct: e.metrics.long_form_pct,
            shorts_pct: e.metrics.shorts_pct,
            engagement_ratio: e.metrics.engagement_ratio,
            recent_video_count: e.metrics.recent_video_count,
            upload_trend: e.metrics.upload_trend,
            upload_trend_pct: e.metrics.upload_trend_pct,
          },
          quality_score: e.result.score,
          base_quality_score: baseQualityScore.get(c.youtube_channel_id) ?? null,
          quality_breakdown: e.result.breakdown,
          relevance_score: e.relevance.score,
          faceless: { heuristic: facelessHeuristic.get(c.youtube_channel_id) ?? null, final: e.faceless.score },
          has_business_email: !!e.businessEmail,
          has_links: e.links,
          sponsorship_detected: e.sponsorship,
          signals_video_id: e.videos[0]?.id ?? null,
          thumbnail: p2?.thumbnail_quality
            ? {
                ok: analysisSucceeded(p2.thumbnail_quality.signal),
                score: p2.thumbnail_quality.score,
                needs_improvement: p2.thumbnail_quality.needs_improvement,
                face_detected: p2.thumbnail_quality.face_detected,
                face_confidence: p2.thumbnail_quality.face_confidence,
                video_ids: e.videos.slice(0, 6).map((v) => v.id),
              }
            : null,
          comments: p2?.comment_signals
            ? {
                ok: analysisSucceeded(p2.comment_signals.signal),
                score: p2.comment_signals.score,
                needs_help: p2.comment_signals.needs_help,
              }
            : null,
          transcript: p2?.transcript_analysis
            ? {
                ok: analysisSucceeded(p2.transcript_analysis.faceless_signal),
                is_faceless: p2.transcript_analysis.is_faceless,
                faceless_confidence: p2.transcript_analysis.faceless_confidence,
                editing_need_score: p2.transcript_analysis.editing_need_score,
              }
            : null,
          won_similarity: p2?.won_similarity ?? null,
          editing: p2?.editing_analysis
            ? {
                quality: p2.editing_analysis.editing_quality,
                levels: Object.fromEntries(
                  Object.entries(p2.editing_analysis.dimensions).map(([key, d]) => [key, d.level]),
                ),
                format: p2.editing_analysis.format,
                video_id: p2.editing_analysis.video_id,
                model: p2.editing_analysis.model,
                reused: p2.editing_reused,
              }
            : null,
        },
      })
    }

    // Sort by lead score descending (client can re-sort)
    leads.sort((a, b) => b.score - a.score)

    const exclusionReasons: Record<string, number> = {}
    for (const e of evaluated) {
      if (!e.result.excluded || !e.result.exclusionReason) continue
      const reason = e.result.exclusionReason.split(/ — |:/)[0].trim()
      exclusionReasons[reason] = (exclusionReasons[reason] ?? 0) + 1
    }
    const passedQuality = evaluated.filter((e) => !e.result.excluded && e.result.score >= qualityThreshold)
    await recordResearchEvents(supabase, [
      runEvent({
        details_fetched: details.length,
        in_subscriber_range: details.filter((c) => c.subscriber_count >= min_subscribers && c.subscriber_count <= max_subscribers).length,
        deep_analyzed: candidates.length,
        second_pass_added: secondPassIds.size,
        analyzed: evaluated.length,
        excluded: evaluated.filter((e) => e.result.excluded).length,
        below_threshold: evaluated.filter((e) => !e.result.excluded && e.result.score < qualityThreshold).length,
        phase2_analyzed: phase2Candidates.length,
        faceless_filtered: faceless_mode ? passedQuality.filter((e) => e.faceless.score < min_faceless_score).length : 0,
        editing_targets: editingTargets.size,
        editing_reviewed: [...phase2Map.values()].filter((p) => p.editing_analysis && !p.editing_reused).length,
        editing_reused: [...phase2Map.values()].filter((p) => p.editing_reused).length,
        dropped_after_editing: phase2Candidates.filter((e) => e.result.score < qualityThreshold).length,
        already_in_pipeline: alreadyInPipeline,
        returned: leads.length,
        exclusion_reasons: exclusionReasons,
      }),
      ...signalEvents,
    ])

    return NextResponse.json({
      channels: leads,
      count: leads.length,
      analyzed: evaluated.length,
      excluded: evaluated.filter((e) => e.result.excluded).length,
      expanded_concepts: allConcepts,
      original_keywords: keywords,
      list_mined_count: allMinedIds.length,
    })
  } catch (err) {
    console.error("Discovery error:", err)
    return NextResponse.json({ error: "Discovery failed" }, { status: 500 })
  }
}
