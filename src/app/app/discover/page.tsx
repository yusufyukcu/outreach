"use client"
import { useState, useMemo, useEffect } from "react"
import {
  Search, Loader2, Sparkles, Ghost, Wand2,
  ArrowUpDown, Zap, SlidersHorizontal, ChevronDown, X,
} from "lucide-react"
import { Header } from "@/components/layout/header"
import { Input } from "@/components/ui/input"
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

const PRESETS: { label: string; keywords: string; faceless?: boolean; color: string }[] = [
  { label: "🌍 Africa facts",        keywords: "africa facts, top 10 africa",                           faceless: true,  color: "from-emerald-500 to-teal-400" },
  { label: "🏙️ Megaprojects",        keywords: "megaprojects, mega construction, infrastructure",        faceless: true,  color: "from-blue-500 to-cyan-400" },
  { label: "🌎 Country rankings",    keywords: "richest countries, top countries, country comparison",   faceless: true,  color: "from-violet-500 to-purple-400" },
  { label: "🏛️ History docs",        keywords: "history explained, ancient history, world history facts",faceless: true,  color: "from-amber-500 to-orange-400" },
  { label: "🚀 Space & science",     keywords: "space facts, science explained, universe documentary",   faceless: true,  color: "from-indigo-500 to-blue-400" },
  { label: "💰 Personal finance",    keywords: "personal finance, investing for beginners, passive income",              color: "from-green-500 to-emerald-400" },
  { label: "📈 Stock market",        keywords: "stock market explained, investing tips, finance education",              color: "from-rose-500 to-pink-400" },
  { label: "🏢 Entrepreneurship",    keywords: "entrepreneur, startup, business tips, side hustle",                      color: "from-orange-500 to-amber-400" },
  { label: "🤖 AI explained",        keywords: "artificial intelligence explained, AI technology, future tech",          color: "from-cyan-500 to-sky-400" },
  { label: "💻 Tech reviews",        keywords: "tech review, gadget review, technology",                                 color: "from-slate-600 to-slate-400" },
  { label: "🧠 Psychology facts",    keywords: "psychology facts, human behavior, mind explained",       faceless: true,  color: "from-fuchsia-500 to-violet-400" },
  { label: "🏠 Real estate",         keywords: "real estate investing, property tips, real estate explained",            color: "from-lime-500 to-green-400" },
]

export default function DiscoverPage() {
  const router = useRouter()
  const [keywords, setKeywords]             = useState("")
  const [niche, setNiche]                   = useState("Any Niche")
  const [minSubs, setMinSubs]               = useState("5000")
  const [maxSubs, setMaxSubs]               = useState("1000000")
  const [serviceType, setServiceType]       = useState<ServiceType>("editing")
  const [englishOnly, setEnglishOnly]       = useState(true)
  const [includeLowQuality, setIncludeLowQuality] = useState(false)
  const [facelessMode, setFacelessMode]     = useState(false)
  const [sortKey, setSortKey]               = useState<SortKey>("score")
  const [showFilters, setShowFilters]       = useState(false)
  const [loading, setLoading]               = useState(false)
  const [results, setResults]               = useState<DiscoveredLead[]>([])
  const [meta, setMeta]                     = useState<{ analyzed: number; excluded: number } | null>(null)
  const [expandedConcepts, setExpandedConcepts] = useState<string[]>([])
  const [addedIds, setAddedIds]             = useState<Set<string>>(new Set())
  const [addingId, setAddingId]             = useState<string | null>(null)
  const [hasSearched, setHasSearched]       = useState(false)
  const [ideaPrompt, setIdeaPrompt]         = useState("")
  const [generatingIdeas, setGeneratingIdeas] = useState(false)
  const [showIdeaBar, setShowIdeaBar]       = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [restored, setRestored] = useState(false)

  // ── Restore previous discovery session on mount ────────────────────────
  // Discover results would otherwise be lost when navigating to another page
  // and back. We cache them in sessionStorage until a new search is run.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("discover-session")
      if (raw) {
        const s = JSON.parse(raw)
        if (s.keywords) setKeywords(s.keywords)
        if (typeof s.facelessMode === "boolean") setFacelessMode(s.facelessMode)
        if (Array.isArray(s.results)) setResults(s.results)
        if (s.meta) setMeta(s.meta)
        if (Array.isArray(s.expandedConcepts)) setExpandedConcepts(s.expandedConcepts)
        if (Array.isArray(s.addedIds)) setAddedIds(new Set(s.addedIds))
        if (s.hasSearched) setHasSearched(true)
        if (s.serviceType) setServiceType(s.serviceType)
      }
    } catch { /* ignore corrupt cache */ }
    setRestored(true)
  }, [])

  // ── Persist discovery session whenever results change ──────────────────
  useEffect(() => {
    if (!restored) return
    try {
      sessionStorage.setItem("discover-session", JSON.stringify({
        keywords, facelessMode, results, meta, expandedConcepts,
        addedIds: [...addedIds], hasSearched, serviceType,
      }))
    } catch { /* quota / serialization issues — non-fatal */ }
  }, [restored, keywords, facelessMode, results, meta, expandedConcepts, addedIds, hasSearched, serviceType])

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
        toast({ title: "No qualifying leads", description: `Analyzed ${data.analyzed ?? 0}, excluded ${data.excluded ?? 0}. Try enabling lower quality.` })
      } else {
        toast({ title: `${data.channels.length} qualified leads found` })
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
        setShowIdeaBar(false)
        setIdeaPrompt("")
        toast({ title: "Keywords generated!", description: "Click Discover to search." })
      }
    } catch {
      toast({ title: "Could not generate keywords", variant: "destructive" })
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
      <Header title="Lead Finder" subtitle="AI-powered YouTube channel discovery" />

      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* ── Search card ─────────────────────────────────────────────── */}
        <div className="animate-fade-in-up rounded-2xl overflow-hidden" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>

          {/* Search bar row */}
          <div className="p-4 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                className="w-full h-11 rounded-xl border border-input bg-muted/40 pl-10 pr-4 text-sm outline-none transition-all duration-150 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 placeholder:text-muted-foreground/60"
                placeholder="e.g. africa facts, megaprojects, history explained..."
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
              />
            </div>

            {/* Faceless toggle pill */}
            <button
              onClick={() => setFacelessMode(!facelessMode)}
              className={`pressable inline-flex items-center gap-1.5 rounded-xl px-3 h-11 text-sm font-medium transition-all duration-150 whitespace-nowrap ${
                facelessMode
                  ? "bg-violet-600 text-white shadow-md"
                  : "border border-input text-muted-foreground hover:text-foreground hover:border-violet-300"
              }`}
            >
              <Ghost className="h-3.5 w-3.5" />
              Faceless
            </button>

            {/* Filters toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`pressable inline-flex items-center gap-1.5 rounded-xl px-3 h-11 text-sm font-medium transition-all duration-150 whitespace-nowrap ${
                showFilters ? "" : "border border-input text-muted-foreground hover:text-foreground"
              }`}
              style={showFilters ? { border: "1px solid rgba(96,165,250,0.4)", color: "#60a5fa", background: "rgba(96,165,250,0.08)" } : {}}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showFilters ? "rotate-180" : ""}`} />
            </button>

            {/* Discover button */}
            <button
              onClick={handleDiscover}
              disabled={loading}
              className="btn-glow pressable inline-flex items-center gap-2 rounded-xl px-5 h-11 text-sm font-bold text-white whitespace-nowrap disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" />Analyzing…</>
                : <><Zap className="h-4 w-4" fill="white" />Discover</>
              }
            </button>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="animate-fade-in px-4 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Niche</p>
                <Select value={niche} onValueChange={setNiche}>
                  <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NICHES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Service</p>
                <Select value={serviceType} onValueChange={(v) => setServiceType(v as ServiceType)}>
                  <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editing">Video Editing</SelectItem>
                    <SelectItem value="thumbnails">Thumbnails</SelectItem>
                    <SelectItem value="scripting">Scriptwriting</SelectItem>
                    <SelectItem value="growth">Channel Growth</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Min subs</p>
                <Input className="h-9 rounded-xl text-sm" placeholder="5000" value={minSubs} onChange={(e) => setMinSubs(e.target.value)} />
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Max subs</p>
                <Input className="h-9 rounded-xl text-sm" placeholder="1000000" value={maxSubs} onChange={(e) => setMaxSubs(e.target.value)} />
              </div>

              <div className="col-span-full flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
                  <input type="checkbox" checked={englishOnly} onChange={(e) => setEnglishOnly(e.target.checked)} className="h-3.5 w-3.5 rounded accent-indigo-600" />
                  English only
                </label>
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
                  <input type="checkbox" checked={includeLowQuality} onChange={(e) => setIncludeLowQuality(e.target.checked)} className="h-3.5 w-3.5 rounded accent-indigo-600" />
                  Include lower quality
                </label>
              </div>
            </div>
          )}

          {/* Bottom button strip */}
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={() => { setShowIdeaBar(!showIdeaBar); setShowSuggestions(false) }}
              className={`pressable inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition-all ${showIdeaBar ? "bg-violet-600 text-white" : "bg-gradient-to-r from-violet-500 to-purple-500 text-white"}`}
            >
              <Wand2 className="h-3 w-3" />
              AI Ideas
            </button>
            <button
              onClick={() => { setShowSuggestions(!showSuggestions); setShowIdeaBar(false) }}
              className={`pressable inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition-all ${showSuggestions ? "bg-indigo-600 text-white" : "bg-gradient-to-r from-indigo-500 to-blue-500 text-white"}`}
            >
              <Sparkles className="h-3 w-3" />
              Suggestions
            </button>
          </div>

          {/* AI idea bar */}
          {showIdeaBar && (
            <div className="animate-fade-in overflow-hidden" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(135deg, rgba(120,87,255,0.08) 0%, rgba(88,80,236,0.08) 100%)" }}>
              {/* Header strip */}
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl flex items-center justify-center shadow-md shrink-0" style={{ background: "linear-gradient(135deg, hsl(280 75% 60%), hsl(243 75% 59%))" }}>
                    <Wand2 className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#c4b5fd" }}>AI Keyword Ideas</p>
                    <p className="text-[11px]" style={{ color: "#a78bfa" }}>Describe what you&apos;re looking for, AI writes the keywords</p>
                  </div>
                </div>
                <button onClick={() => setShowIdeaBar(false)} className="pressable h-7 w-7 rounded-lg flex items-center justify-center transition-colors" style={{ color: "#a78bfa" }}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Input row */}
              <div className="px-5 pb-4 flex items-center gap-2">
                <div className="relative flex-1">
                  <Sparkles className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-400 pointer-events-none" />
                  <input
                    className="w-full h-11 rounded-xl pl-10 pr-4 text-sm outline-none transition-all duration-150 focus:ring-2 focus:ring-violet-500/15"
                    style={{ border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.07)", color: "#e2d9f3" }}
                    placeholder='e.g. "faceless channels about top 10 lists in Africa"'
                    value={ideaPrompt}
                    onChange={(e) => setIdeaPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGenerateIdeas()}
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleGenerateIdeas}
                  disabled={generatingIdeas || !ideaPrompt.trim()}
                  className="pressable inline-flex items-center gap-2 rounded-xl px-4 h-11 text-sm font-bold text-white whitespace-nowrap disabled:opacity-50 shadow-md"
                  style={{ background: "linear-gradient(135deg, hsl(280 75% 60%), hsl(243 75% 59%))" }}
                >
                  {generatingIdeas
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Thinking…</>
                    : <><Sparkles className="h-4 w-4" />Generate Keywords</>
                  }
                </button>
              </div>

              {/* Example prompts */}
              <div className="px-5 pb-4 flex flex-wrap gap-1.5">
                {[
                  "Faceless channels about world history",
                  "Top 10 list channels under 500k subs",
                  "Finance channels that don't show face",
                  "Science documentary channels",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setIdeaPrompt(example)}
                    className="pressable inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium transition-all"
                    style={{ border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.1)", color: "#a78bfa" }}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions panel */}
          {showSuggestions && (
            <div className="animate-fade-in overflow-hidden" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(135deg, rgba(88,80,236,0.08) 0%, rgba(56,189,248,0.06) 100%)" }}>
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl flex items-center justify-center shadow-md shrink-0" style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(199 90% 55%))" }}>
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#a5b4fc" }}>Keyword Suggestions</p>
                    <p className="text-[11px] text-indigo-400">Pick a niche to auto-fill keywords and start searching</p>
                  </div>
                </div>
                <button onClick={() => setShowSuggestions(false)} className="pressable h-7 w-7 rounded-lg flex items-center justify-center text-indigo-400 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => { setKeywords(p.keywords); if (p.faceless) setFacelessMode(true); setShowSuggestions(false) }}
                    className="pressable group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <span className={`h-8 w-8 rounded-lg bg-gradient-to-br ${p.color} shrink-0 flex items-center justify-center text-base shadow-sm`}>
                      {p.label.split(" ")[0]}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-foreground truncate">{p.label.split(" ").slice(1).join(" ")}</span>
                      {p.faceless && <span className="inline-flex items-center gap-0.5 text-[10px] text-violet-500 font-medium"><Ghost className="h-2.5 w-2.5" />faceless</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── AI-expanded concepts ─────────────────────────────────────── */}
        {!loading && expandedConcepts.length > 0 && (
          <div className="animate-fade-in flex items-start gap-3 rounded-2xl px-4 py-3" style={{ background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.2)" }}>
            <Sparkles className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#a78bfa" }} />
            <div>
              <p className="text-xs font-bold mb-2" style={{ color: "#c4b5fd" }}>AI expanded your search to:</p>
              <div className="flex flex-wrap gap-1.5">
                {expandedConcepts.map((c) => (
                  <span key={c} className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)", color: "#c4b5fd" }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Loading ──────────────────────────────────────────────────── */}
        {loading && <DiscoverLoadingScene faceless={facelessMode} />}

        {/* ── No results ───────────────────────────────────────────────── */}
        {!loading && hasSearched && sortedResults.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="font-semibold">No qualifying leads found</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              {meta ? `Analyzed ${meta.analyzed}, excluded ${meta.excluded} inactive/weak channels. ` : ""}
              Try enabling &quot;Include lower quality&quot; or broadening your filters.
            </p>
          </div>
        )}

        {/* ── Results ──────────────────────────────────────────────────── */}
        {!loading && sortedResults.length > 0 && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-7 min-w-7 rounded-full bg-foreground text-white text-xs font-bold px-2">{sortedResults.length}</span>
                <span className="text-sm font-semibold">qualified leads</span>
                {meta && <span className="text-xs text-muted-foreground">· analyzed {meta.analyzed} · excluded {meta.excluded}</span>}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                  <SelectTrigger className="w-40 h-8 rounded-xl text-xs"><SelectValue /></SelectTrigger>
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

        {/* ── Empty hero ───────────────────────────────────────────────── */}
        {!hasSearched && <DiscoverHeroScene />}
      </div>
    </div>
  )
}

/* ── Loading scene ──────────────────────────────────────────────────── */

const STEPS = [
  { label: "Expanding keywords with AI", color: "from-violet-500 to-purple-400" },
  { label: "Searching YouTube videos",   color: "from-blue-500 to-cyan-400" },
  { label: "Collecting channel data",    color: "from-indigo-500 to-blue-400" },
  { label: "Analyzing recent content",   color: "from-pink-500 to-rose-400" },
  { label: "Scoring & ranking leads",    color: "from-amber-400 to-orange-400" },
]

function DiscoverLoadingScene({ faceless }: { faceless: boolean }) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center py-8 px-4 select-none">
      {/* 3D blocks */}
      <div className="relative w-56 h-44 mb-6" style={{ perspective: "600px" }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-40 h-40 rounded-full animate-morph" style={{ background: "radial-gradient(ellipse, hsl(243 75% 59% / 0.12) 0%, transparent 70%)", filter: "blur(24px)" }} />
        </div>

        <div className="animate-block-1 absolute" style={{ left: "30%", top: "28%", transformStyle: "preserve-3d" }}>
          <div className="w-16 h-16 rounded-2xl" style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(243 75% 45%))", boxShadow: "0 20px 40px hsl(243 75% 59% / 0.45), inset 0 1px 0 hsl(0 0% 100% / 0.2)" }} />
        </div>
        <div className="animate-block-2 absolute" style={{ left: "8%", top: "38%", transformStyle: "preserve-3d" }}>
          <div className="w-10 h-10 rounded-xl" style={{ background: "linear-gradient(135deg, hsl(330 80% 65%), hsl(350 80% 60%))", boxShadow: "0 12px 28px hsl(330 80% 65% / 0.45)" }} />
        </div>
        <div className="animate-block-3 absolute" style={{ right: "10%", top: "18%", transformStyle: "preserve-3d" }}>
          <div className="w-8 h-8 rounded-lg" style={{ background: "linear-gradient(135deg, hsl(190 90% 55%), hsl(200 90% 50%))", boxShadow: "0 10px 24px hsl(190 90% 55% / 0.5)" }} />
        </div>
        <div className="animate-block-4 absolute" style={{ right: "24%", top: "50%", transformStyle: "preserve-3d" }}>
          <div className="w-7 h-14 rounded-xl" style={{ background: "linear-gradient(180deg, hsl(280 75% 65%), hsl(280 75% 50%))", boxShadow: "0 16px 32px hsl(280 75% 60% / 0.4)" }} />
        </div>
        <div className="animate-block-2 absolute" style={{ left: "50%", top: "12%", animationDelay: "0.6s" }}>
          <div className="w-5 h-5 rounded-lg" style={{ background: "linear-gradient(135deg, hsl(38 95% 60%), hsl(20 95% 55%))", boxShadow: "0 8px 16px hsl(38 95% 60% / 0.5)" }} />
        </div>

        {/* Orbit ring */}
        <div className="absolute" style={{ left: "42%", top: "36%", width: "60px", height: "60px" }}>
          <div className="absolute inset-0 rounded-full border-2 animate-spin-slow" style={{ borderColor: "transparent", borderTopColor: "hsl(243 75% 59% / 0.5)", borderRightColor: "hsl(280 75% 60% / 0.3)" }} />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full animate-orbit" style={{ background: "hsl(243 75% 59%)", boxShadow: "0 0 8px hsl(243 75% 59%)", transformOrigin: "0 30px" }} />
        </div>
      </div>

      <h3 className="text-xl font-bold mb-1 gradient-text">
        {faceless ? "Hunting Faceless Channels…" : "Finding Your Best Leads…"}
      </h3>
      <p className="text-sm text-muted-foreground mb-7">This takes 30–60 seconds — AI is doing the heavy lifting</p>

      <div className="w-full max-w-sm space-y-2">
        {STEPS.map((step, i) => (
          <div key={step.label} className="animate-fade-in-up flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ animationDelay: `${i * 100}ms`, background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className={`h-2 w-2 rounded-full bg-gradient-to-br ${step.color} shrink-0`} />
            <p className="text-xs font-medium text-foreground flex-1">{step.label}</p>
            <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r ${step.color}`} style={{ animation: `progress-fill 3.5s ease-out both`, animationDelay: `${i * 0.9}s` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Hero empty state ───────────────────────────────────────────────── */

function DiscoverHeroScene() {
  return (
    <div className="animate-fade-in-up flex flex-col items-center justify-center py-8 select-none" style={{ animationDelay: "150ms" }}>
      <div className="relative w-64 h-44 mb-6" style={{ perspective: "500px" }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-48 h-32 rounded-full" style={{ background: "radial-gradient(ellipse, hsl(243 75% 59% / 0.08) 0%, transparent 70%)", filter: "blur(16px)" }} />
        </div>
        <div className="animate-block-1 absolute" style={{ left: "35%", top: "25%" }}>
          <div className="w-20 h-20 rounded-3xl" style={{ background: "linear-gradient(135deg, hsl(243 75% 62%), hsl(280 75% 65%))", boxShadow: "0 24px 48px hsl(243 75% 59% / 0.35), inset 0 1px 0 hsl(0 0% 100% / 0.25)" }} />
        </div>
        <div className="animate-block-2 absolute" style={{ left: "8%", top: "35%" }}>
          <div className="w-12 h-12 rounded-2xl" style={{ background: "linear-gradient(135deg, hsl(190 85% 55%), hsl(210 85% 55%))", boxShadow: "0 14px 28px hsl(190 85% 55% / 0.4)" }} />
        </div>
        <div className="animate-block-3 absolute" style={{ right: "10%", top: "15%" }}>
          <div className="w-9 h-9 rounded-xl" style={{ background: "linear-gradient(135deg, hsl(330 80% 65%), hsl(350 75% 60%))", boxShadow: "0 10px 22px hsl(330 80% 65% / 0.4)" }} />
        </div>
        <div className="animate-block-4 absolute" style={{ right: "22%", top: "50%" }}>
          <div className="w-7 h-16 rounded-xl" style={{ background: "linear-gradient(180deg, hsl(38 95% 62%), hsl(20 90% 55%))", boxShadow: "0 14px 28px hsl(38 95% 60% / 0.4)" }} />
        </div>
        <div className="animate-block-2 absolute" style={{ left: "55%", top: "10%", animationDelay: "0.5s" }}>
          <div className="w-5 h-5 rounded-lg" style={{ background: "linear-gradient(135deg, hsl(160 80% 50%), hsl(180 80% 45%))", boxShadow: "0 8px 16px hsl(160 80% 50% / 0.45)" }} />
        </div>
      </div>

      <h3 className="text-2xl font-bold mb-2">Find Channels <span className="gradient-text">Worth Contacting</span></h3>
      <p className="text-sm text-muted-foreground max-w-xs text-center leading-relaxed">
        Type keywords above or pick a preset. AI expands your search, analyzes content quality, and scores each channel.
      </p>

      <div className="flex flex-wrap justify-center gap-2 mt-5">
        {[
          { label: "AI keyword expansion", style: { background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)", color: "#c4b5fd" } },
          { label: "Content analysis",     style: { background: "rgba(96,165,250,0.12)",  border: "1px solid rgba(96,165,250,0.25)",  color: "#93c5fd" } },
          { label: "Faceless detection",   style: { background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.25)", color: "#a5b4fc" } },
          { label: "Auto lead scoring",    style: { background: "rgba(251,113,133,0.12)", border: "1px solid rgba(251,113,133,0.25)", color: "#fda4af" } },
        ].map((pill) => (
          <span key={pill.label} className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium" style={pill.style}>
            {pill.label}
          </span>
        ))}
      </div>
    </div>
  )
}
