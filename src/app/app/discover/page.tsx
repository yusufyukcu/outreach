"use client"
import { useState, useMemo } from "react"
import { Search, Loader2, SlidersHorizontal, ArrowUpDown, Sparkles, Ghost, Wand2, ChevronDown, ChevronUp, Zap } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChannelCard } from "@/components/leads/channel-card"
import { toast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import type { DiscoveredLead, ServiceType } from "@/types"

const NICHES = [
  "Any Niche", "Technology", "Personal Finance", "Health & Fitness", "Food & Cooking",
  "Gaming", "Travel & Vlogging", "Beauty & Fashion", "Business", "Education",
  "Music", "Comedy", "News & Politics", "Sports", "Real Estate", "Lifestyle",
]

type SortKey = "score" | "relevance" | "faceless" | "activity" | "views" | "consistency"

const KEYWORD_PRESETS: { label: string; keywords: string; faceless?: boolean }[] = [
  { label: "🌍 Africa facts", keywords: "africa facts, top 10 africa", faceless: true },
  { label: "🏙️ Megaprojects", keywords: "megaprojects, mega construction, infrastructure", faceless: true },
  { label: "🌎 Country rankings", keywords: "richest countries, top countries, country comparison", faceless: true },
  { label: "🏛️ History documentary", keywords: "history explained, ancient history, world history facts", faceless: true },
  { label: "🌆 City rankings", keywords: "biggest cities, most beautiful cities, city comparison", faceless: true },
  { label: "🚀 Space & science", keywords: "space facts, science explained, universe documentary", faceless: true },
  { label: "💰 Personal finance", keywords: "personal finance, investing for beginners, passive income" },
  { label: "📈 Stock market", keywords: "stock market explained, investing tips, finance education" },
  { label: "🏠 Real estate", keywords: "real estate investing, property tips, real estate explained" },
  { label: "🏢 Entrepreneurship", keywords: "entrepreneur, startup, business tips, side hustle" },
  { label: "📱 Online business", keywords: "online business, make money online, digital marketing" },
  { label: "💪 Fitness education", keywords: "workout tips, fitness explained, gym beginner" },
  { label: "🧠 Psychology facts", keywords: "psychology facts, human behavior, mind explained" },
  { label: "🤖 AI explained", keywords: "artificial intelligence explained, AI technology, future tech" },
  { label: "💻 Tech reviews", keywords: "tech review, gadget review, technology" },
]

export default function DiscoverPage() {
  const router = useRouter()
  const [keywords, setKeywords] = useState("")
  const [niche, setNiche] = useState("Any Niche")
  const [minSubs, setMinSubs] = useState("5000")
  const [maxSubs, setMaxSubs] = useState("1000000")
  const [serviceType, setServiceType] = useState<ServiceType>("editing")
  const [englishOnly, setEnglishOnly] = useState(true)
  const [includeLowQuality, setIncludeLowQuality] = useState(false)
  const [facelessMode, setFacelessMode] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("score")

  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<DiscoveredLead[]>([])
  const [meta, setMeta] = useState<{ analyzed: number; excluded: number } | null>(null)
  const [expandedConcepts, setExpandedConcepts] = useState<string[]>([])
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [addingId, setAddingId] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const [showIdeas, setShowIdeas] = useState(false)
  const [ideaPrompt, setIdeaPrompt] = useState("")
  const [generatingIdeas, setGeneratingIdeas] = useState(false)

  async function handleDiscover() {
    if (!keywords.trim()) {
      toast({ title: "Enter keywords", description: "Type keywords to search for channels", variant: "destructive" })
      return
    }
    setLoading(true)
    setHasSearched(true)
    try {
      const res = await fetch("/api/channels/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
          niche: niche === "Any Niche" ? "" : niche,
          min_subscribers: parseInt(minSubs) || 10000,
          max_subscribers: parseInt(maxSubs) || 500000,
          service_type: serviceType,
          min_score: 60,
          include_low_quality: includeLowQuality,
          english_only: englishOnly,
          min_recent_views: 1000,
          faceless_mode: facelessMode,
          min_faceless_score: 50,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Discovery failed")
      setResults(data.channels ?? [])
      setMeta({ analyzed: data.analyzed ?? 0, excluded: data.excluded ?? 0 })
      setExpandedConcepts(data.expanded_concepts ?? [])
      if ((data.channels?.length ?? 0) === 0) {
        toast({ title: "No qualifying leads", description: `Analyzed ${data.analyzed ?? 0}, excluded ${data.excluded ?? 0}. Try "show lower quality" or broaden filters.` })
      } else {
        toast({ title: `${data.channels.length} qualified leads`, description: `Analyzed ${data.analyzed}, excluded ${data.excluded} weak/inactive channels` })
      }
    } catch (err) {
      toast({ title: "Discovery failed", description: err instanceof Error ? err.message : "Check YouTube API key", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateIdeas() {
    if (!ideaPrompt.trim()) return
    setGeneratingIdeas(true)
    try {
      const res = await fetch("/api/keywords/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: ideaPrompt, service_type: serviceType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.keywords) {
        setKeywords(data.keywords)
        if (data.faceless_recommended) setFacelessMode(true)
        setShowIdeas(false)
        setIdeaPrompt("")
        toast({ title: "Keywords generated!", description: "Click Discover to search with these keywords." })
      }
    } catch {
      toast({ title: "Could not generate keywords", description: "Check your OpenAI API key", variant: "destructive" })
    } finally {
      setGeneratingIdeas(false)
    }
  }

  async function handleAddToLeads(lead: DiscoveredLead) {
    if (!lead.id) {
      toast({ title: "Lead not saved yet", description: "Re-run discovery and try again", variant: "destructive" })
      return
    }
    setAddingId(lead.id)
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: lead.id, score: lead.score, score_breakdown: lead.quality_breakdown }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAddedIds((prev) => new Set([...prev, lead.id!]))
      toast({ title: "Added to leads!", description: `${lead.name} is now in your pipeline` })
      router.refresh()
    } catch {
      toast({ title: "Failed to add lead", variant: "destructive" })
    } finally {
      setAddingId(null)
    }
  }

  const sortedResults = useMemo(() => {
    const arr = [...results]
    switch (sortKey) {
      case "relevance":   arr.sort((a, b) => b.relevance_score - a.relevance_score); break
      case "faceless":    arr.sort((a, b) => b.faceless_score - a.faceless_score); break
      case "activity":    arr.sort((a, b) => (a.metrics.days_since_upload ?? 9999) - (b.metrics.days_since_upload ?? 9999)); break
      case "views":       arr.sort((a, b) => b.metrics.median_recent_views - a.metrics.median_recent_views); break
      case "consistency": arr.sort((a, b) => b.metrics.upload_frequency_per_week - a.metrics.upload_frequency_per_week); break
      default:            arr.sort((a, b) => b.score - a.score)
    }
    return arr
  }, [results, sortKey])

  return (
    <div className="flex flex-col overflow-auto">
      <Header title="Lead Finder" subtitle="Finds active, long-form channels worth contacting — not random keyword matches" />

      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Search form */}
        <div className="animate-fade-in-up rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2 space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keywords</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g. top 10 africa, megaprojects, history explained..."
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
                  className="pl-9 rounded-xl"
                />
              </div>
              <p className="text-xs text-muted-foreground">Separate multiple keywords with commas</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Niche</Label>
              <Select value={niche} onValueChange={setNiche}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NICHES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Service</Label>
              <Select value={serviceType} onValueChange={(v) => setServiceType(v as ServiceType)}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="editing">Video Editing</SelectItem>
                  <SelectItem value="thumbnails">Thumbnails</SelectItem>
                  <SelectItem value="scripting">Scriptwriting</SelectItem>
                  <SelectItem value="growth">Channel Growth</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Subs:</span>
              <Input className="w-24 h-8 rounded-lg text-sm" placeholder="Min" value={minSubs} onChange={(e) => setMinSubs(e.target.value)} />
              <span className="text-sm text-muted-foreground">–</span>
              <Input className="w-24 h-8 rounded-lg text-sm" placeholder="Max" value={maxSubs} onChange={(e) => setMaxSubs(e.target.value)} />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={englishOnly} onChange={(e) => setEnglishOnly(e.target.checked)} className="h-4 w-4 rounded border-input accent-indigo-600" />
              English only
            </label>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={includeLowQuality} onChange={(e) => setIncludeLowQuality(e.target.checked)} className="h-4 w-4 rounded border-input accent-indigo-600" />
              Show lower quality
            </label>

            <button
              onClick={() => setFacelessMode(!facelessMode)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-all ${
                facelessMode
                  ? "border-violet-400 bg-violet-50 text-violet-800 shadow-sm"
                  : "border-input text-muted-foreground hover:text-foreground"
              }`}
            >
              <Ghost className="h-3.5 w-3.5" />
              Faceless only
            </button>

            <Button
              onClick={handleDiscover}
              disabled={loading}
              className="ml-auto btn-glow rounded-xl px-6"
              style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
            >
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing...</>
                : <><Zap className="mr-2 h-4 w-4" fill="white" />Discover Leads</>
              }
            </Button>
          </div>
        </div>

        {/* Keyword Ideas Panel */}
        <div className="animate-fade-in-up rounded-2xl border bg-white overflow-hidden shadow-sm" style={{ animationDelay: "80ms" }}>
          <button
            className="flex items-center justify-between w-full px-5 py-4 text-sm font-medium hover:bg-muted/30 transition-colors"
            onClick={() => setShowIdeas(!showIdeas)}
          >
            <span className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-400 flex items-center justify-center">
                <Wand2 className="h-3.5 w-3.5 text-white" />
              </div>
              Not sure what to search? Get keyword ideas
            </span>
            {showIdeas ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {showIdeas && (
            <div className="animate-fade-in border-t px-5 pb-5 pt-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Describe the type of channel you want to find:</p>
                <div className="flex gap-2">
                  <Input
                    placeholder='e.g. "faceless channels about Africa that make top 10 videos"'
                    value={ideaPrompt}
                    onChange={(e) => setIdeaPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGenerateIdeas()}
                    className="flex-1 rounded-xl"
                  />
                  <Button
                    variant="secondary"
                    onClick={handleGenerateIdeas}
                    disabled={generatingIdeas || !ideaPrompt.trim()}
                    className="rounded-xl"
                  >
                    {generatingIdeas
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <><Sparkles className="h-4 w-4 mr-1.5" />Generate</>
                    }
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Or pick a preset:</p>
                <div className="flex flex-wrap gap-2">
                  {KEYWORD_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => { setKeywords(preset.keywords); if (preset.faceless) setFacelessMode(true) }}
                      className="inline-flex items-center gap-1.5 rounded-xl border bg-muted/30 px-3 py-1.5 text-xs font-medium hover:bg-muted hover:border-primary/30 transition-all"
                    >
                      {preset.label}
                      {preset.faceless && <Ghost className="h-3 w-3 text-violet-500" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Expanded concepts */}
        {!loading && expandedConcepts.length > 0 && (
          <div className="animate-fade-in rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
              <span className="text-sm font-semibold text-violet-800">AI-expanded search concepts</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {expandedConcepts.map((c) => (
                <span key={c} className="inline-block rounded-full bg-violet-100 border border-violet-200 px-2.5 py-0.5 text-xs text-violet-700 font-medium">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && <DiscoverLoadingScene faceless={facelessMode} />}

        {/* Empty after search */}
        {!loading && hasSearched && sortedResults.length === 0 && (
          <div className="text-center py-16">
            <Search className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20" />
            <p className="font-semibold">No qualifying leads</p>
            <p className="text-sm text-muted-foreground mt-1">
              {meta ? `Analyzed ${meta.analyzed}, excluded ${meta.excluded} inactive/weak channels. ` : ""}
              Try enabling &quot;Show lower quality&quot; or broadening filters.
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && sortedResults.length > 0 && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-base font-bold">{sortedResults.length}</span>
                <span className="text-sm text-muted-foreground"> qualified leads</span>
                {meta && <span className="text-sm text-muted-foreground"> · analyzed {meta.analyzed} · excluded {meta.excluded} weak</span>}
              </div>
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                  <SelectTrigger className="w-44 h-8 rounded-xl text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="score">Lead Score</SelectItem>
                    <SelectItem value="relevance">Content Relevance</SelectItem>
                    <SelectItem value="faceless">Faceless Score</SelectItem>
                    <SelectItem value="activity">Recent Activity</SelectItem>
                    <SelectItem value="views">Avg Views</SelectItem>
                    <SelectItem value="consistency">Upload Consistency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
              {sortedResults.map((lead) => (
                <ChannelCard
                  key={lead.youtube_channel_id}
                  lead={lead}
                  onAddToLeads={handleAddToLeads}
                  isAdded={!!lead.id && addedIds.has(lead.id)}
                  isLoading={addingId === lead.id}
                />
              ))}
            </div>
          </div>
        )}

        {/* First load empty state */}
        {!hasSearched && <DiscoverHeroScene />}
      </div>
    </div>
  )
}

/* ── Animated loading scene ─────────────────────────────────────────── */

const STEPS = [
  { label: "Expanding keywords with AI", icon: "✦", color: "from-violet-500 to-purple-400" },
  { label: "Searching YouTube videos",   icon: "▶", color: "from-blue-500 to-cyan-400" },
  { label: "Collecting channel data",    icon: "⬡", color: "from-indigo-500 to-blue-400" },
  { label: "Analyzing recent content",   icon: "◎", color: "from-pink-500 to-rose-400" },
  { label: "Scoring & ranking leads",    icon: "★", color: "from-amber-400 to-orange-400" },
]

function DiscoverLoadingScene({ faceless }: { faceless: boolean }) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center py-10 px-4 select-none">
      {/* 3D block scene */}
      <div className="relative w-56 h-48 mb-8" style={{ perspective: "600px" }}>
        {/* Glow backdrop */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-40 h-40 rounded-full animate-morph"
            style={{
              background: "radial-gradient(ellipse, hsl(243 75% 59% / 0.15) 0%, transparent 70%)",
              filter: "blur(20px)",
            }}
          />
        </div>

        {/* Block 1 — large indigo */}
        <div
          className="animate-block-1 absolute"
          style={{ left: "30%", top: "30%", transformStyle: "preserve-3d" }}
        >
          <div
            className="w-16 h-16 rounded-2xl shadow-2xl"
            style={{
              background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(243 75% 45%))",
              boxShadow: "0 20px 40px hsl(243 75% 59% / 0.4), inset 0 1px 0 hsl(0 0% 100% / 0.2)",
            }}
          />
        </div>

        {/* Block 2 — medium pink/rose */}
        <div
          className="animate-block-2 absolute"
          style={{ left: "10%", top: "40%", transformStyle: "preserve-3d" }}
        >
          <div
            className="w-10 h-10 rounded-xl shadow-xl"
            style={{
              background: "linear-gradient(135deg, hsl(330 80% 65%), hsl(350 80% 60%))",
              boxShadow: "0 12px 28px hsl(330 80% 65% / 0.45)",
            }}
          />
        </div>

        {/* Block 3 — small cyan */}
        <div
          className="animate-block-3 absolute"
          style={{ right: "12%", top: "20%", transformStyle: "preserve-3d" }}
        >
          <div
            className="w-8 h-8 rounded-lg shadow-lg"
            style={{
              background: "linear-gradient(135deg, hsl(190 90% 55%), hsl(200 90% 50%))",
              boxShadow: "0 10px 24px hsl(190 90% 55% / 0.5)",
            }}
          />
        </div>

        {/* Block 4 — tall violet */}
        <div
          className="animate-block-4 absolute"
          style={{ right: "25%", top: "48%", transformStyle: "preserve-3d" }}
        >
          <div
            className="w-7 h-14 rounded-xl shadow-xl"
            style={{
              background: "linear-gradient(180deg, hsl(280 75% 65%), hsl(280 75% 50%))",
              boxShadow: "0 16px 32px hsl(280 75% 60% / 0.4)",
            }}
          />
        </div>

        {/* Block 5 — tiny amber dot */}
        <div
          className="animate-block-2 absolute"
          style={{ left: "50%", top: "15%", animationDelay: "0.6s" }}
        >
          <div
            className="w-5 h-5 rounded-lg"
            style={{
              background: "linear-gradient(135deg, hsl(38 95% 60%), hsl(20 95% 55%))",
              boxShadow: "0 8px 16px hsl(38 95% 60% / 0.5)",
            }}
          />
        </div>

        {/* Orbiting ring */}
        <div
          className="absolute"
          style={{
            left: "42%", top: "38%",
            width: "60px", height: "60px",
          }}
        >
          <div
            className="absolute inset-0 rounded-full border-2 animate-spin-slow"
            style={{
              borderColor: "transparent",
              borderTopColor: "hsl(243 75% 59% / 0.5)",
              borderRightColor: "hsl(280 75% 60% / 0.3)",
            }}
          />
          {/* orbiting dot */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full animate-orbit"
            style={{
              background: "hsl(243 75% 59%)",
              boxShadow: "0 0 8px hsl(243 75% 59%)",
              transformOrigin: "0 30px",
            }}
          />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-xl font-bold mb-1 gradient-text">
        {faceless ? "Hunting Faceless Channels..." : "Finding Your Best Leads..."}
      </h3>
      <p className="text-sm text-muted-foreground mb-8">This takes 30–60 seconds — AI is doing the heavy lifting</p>

      {/* Progress steps */}
      <div className="w-full max-w-sm space-y-2.5">
        {STEPS.map((step, i) => (
          <StepRow key={step.label} step={step} index={i} total={STEPS.length} />
        ))}
      </div>
    </div>
  )
}

function StepRow({ step, index, total }: { step: typeof STEPS[0]; index: number; total: number }) {
  const delay = index * 0.9 // seconds offset
  const duration = 3.5 // seconds per step (rough)

  return (
    <div
      className="animate-fade-in-up flex items-center gap-3 rounded-2xl bg-white border px-4 py-3 shadow-sm"
      style={{ animationDelay: `${index * 120}ms` }}
    >
      {/* Icon bubble */}
      <div
        className={`h-8 w-8 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center shrink-0 text-white text-sm font-bold shadow-sm`}
      >
        {step.icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{step.label}</p>
        {/* Progress bar */}
        <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${step.color}`}
            style={{
              animation: `progress-fill ${duration}s ease-out both`,
              animationDelay: `${delay}s`,
              width: "100%",
            }}
          />
        </div>
      </div>

      {/* Spinner / check */}
      <div className="shrink-0">
        <div
          className="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin"
          style={{
            borderColor: `hsl(243 75% 59% / 0.3)`,
            borderTopColor: "hsl(243 75% 59%)",
            animationDuration: "0.7s",
            animationDelay: `${delay}s`,
          }}
        />
      </div>
    </div>
  )
}

/* ── Hero scene (first load) ────────────────────────────────────────── */

function DiscoverHeroScene() {
  return (
    <div className="animate-fade-in-up flex flex-col items-center justify-center py-8 select-none" style={{ animationDelay: "150ms" }}>
      {/* Floating blocks visual */}
      <div className="relative w-64 h-44 mb-6" style={{ perspective: "500px" }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-48 h-32 rounded-full"
            style={{
              background: "radial-gradient(ellipse, hsl(243 75% 59% / 0.08) 0%, transparent 70%)",
              filter: "blur(16px)",
            }}
          />
        </div>

        {/* Main block */}
        <div className="animate-block-1 absolute" style={{ left: "35%", top: "25%" }}>
          <div
            className="w-20 h-20 rounded-3xl"
            style={{
              background: "linear-gradient(135deg, hsl(243 75% 62%), hsl(280 75% 65%))",
              boxShadow: "0 24px 48px hsl(243 75% 59% / 0.35), inset 0 1px 0 hsl(0 0% 100% / 0.25)",
            }}
          />
        </div>

        <div className="animate-block-2 absolute" style={{ left: "8%", top: "35%" }}>
          <div
            className="w-12 h-12 rounded-2xl"
            style={{
              background: "linear-gradient(135deg, hsl(190 85% 55%), hsl(210 85% 55%))",
              boxShadow: "0 14px 28px hsl(190 85% 55% / 0.4)",
            }}
          />
        </div>

        <div className="animate-block-3 absolute" style={{ right: "10%", top: "15%" }}>
          <div
            className="w-9 h-9 rounded-xl"
            style={{
              background: "linear-gradient(135deg, hsl(330 80% 65%), hsl(350 75% 60%))",
              boxShadow: "0 10px 22px hsl(330 80% 65% / 0.4)",
            }}
          />
        </div>

        <div className="animate-block-4 absolute" style={{ right: "22%", top: "50%" }}>
          <div
            className="w-7 h-16 rounded-xl"
            style={{
              background: "linear-gradient(180deg, hsl(38 95% 62%), hsl(20 90% 55%))",
              boxShadow: "0 14px 28px hsl(38 95% 60% / 0.4)",
            }}
          />
        </div>

        <div className="animate-block-2 absolute" style={{ left: "55%", top: "10%", animationDelay: "0.5s" }}>
          <div
            className="w-5 h-5 rounded-lg"
            style={{
              background: "linear-gradient(135deg, hsl(160 80% 50%), hsl(180 80% 45%))",
              boxShadow: "0 8px 16px hsl(160 80% 50% / 0.45)",
            }}
          />
        </div>
      </div>

      <h3 className="text-2xl font-bold mb-2">
        Find Channels <span className="gradient-text">Worth Contacting</span>
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto text-center leading-relaxed">
        Type keywords above or use the ideas panel. AI expands your search,
        analyzes content quality, and scores each channel automatically.
      </p>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center gap-2 mt-5">
        {[
          { label: "AI keyword expansion", color: "bg-violet-50 text-violet-700 border-violet-200" },
          { label: "Content analysis",      color: "bg-blue-50 text-blue-700 border-blue-200" },
          { label: "Faceless detection",    color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
          { label: "Auto second-pass",      color: "bg-pink-50 text-pink-700 border-pink-200" },
        ].map((pill) => (
          <span key={pill.label} className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${pill.color}`}>
            {pill.label}
          </span>
        ))}
      </div>
    </div>
  )
}
