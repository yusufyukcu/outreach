"use client"
import { useState, useMemo } from "react"
import { Search, Loader2, SlidersHorizontal, ArrowUpDown, Sparkles, Ghost, Wand2, ChevronDown, ChevronUp } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { ChannelCard } from "@/components/leads/channel-card"
import { toast } from "@/hooks/use-toast"
import type { DiscoveredLead, ServiceType } from "@/types"

const NICHES = [
  "Any Niche", "Technology", "Personal Finance", "Health & Fitness", "Food & Cooking",
  "Gaming", "Travel & Vlogging", "Beauty & Fashion", "Business", "Education",
  "Music", "Comedy", "News & Politics", "Sports", "Real Estate", "Lifestyle",
]

type SortKey = "score" | "relevance" | "faceless" | "activity" | "views" | "consistency"

// Preset keyword templates grouped by category
const KEYWORD_PRESETS: { label: string; keywords: string; faceless?: boolean }[] = [
  // Geography / Documentary
  { label: "🌍 Africa facts", keywords: "africa facts, top 10 africa", faceless: true },
  { label: "🏙️ Megaprojects", keywords: "megaprojects, mega construction, infrastructure", faceless: true },
  { label: "🌎 Country rankings", keywords: "richest countries, top countries, country comparison", faceless: true },
  { label: "🏛️ History documentary", keywords: "history explained, ancient history, world history facts", faceless: true },
  { label: "🌆 City rankings", keywords: "biggest cities, most beautiful cities, city comparison", faceless: true },
  { label: "🚀 Space & science", keywords: "space facts, science explained, universe documentary", faceless: true },
  // Finance
  { label: "💰 Personal finance", keywords: "personal finance, investing for beginners, passive income" },
  { label: "📈 Stock market", keywords: "stock market explained, investing tips, finance education" },
  { label: "🏠 Real estate", keywords: "real estate investing, property tips, real estate explained" },
  // Business
  { label: "🏢 Entrepreneurship", keywords: "entrepreneur, startup, business tips, side hustle" },
  { label: "📱 Online business", keywords: "online business, make money online, digital marketing" },
  // Health
  { label: "💪 Fitness education", keywords: "workout tips, fitness explained, gym beginner" },
  { label: "🧠 Psychology facts", keywords: "psychology facts, human behavior, mind explained" },
  // Tech
  { label: "🤖 AI explained", keywords: "artificial intelligence explained, AI technology, future tech" },
  { label: "💻 Tech reviews", keywords: "tech review, gadget review, technology" },
]

export default function DiscoverPage() {
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

  // Keyword idea generator
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
        toast({
          title: "No qualifying leads",
          description: `Analyzed ${data.analyzed ?? 0}, excluded ${data.excluded ?? 0}. Try the "show lower quality" toggle or broaden filters.`,
        })
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
        body: JSON.stringify({
          channel_id: lead.id,
          score: lead.score,
          score_breakdown: lead.quality_breakdown,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAddedIds((prev) => new Set([...prev, lead.id!]))
      toast({ title: "Added to leads!", description: `${lead.name} is now in your pipeline` })
    } catch {
      toast({ title: "Failed to add lead", variant: "destructive" })
    } finally {
      setAddingId(null)
    }
  }

  const sortedResults = useMemo(() => {
    const arr = [...results]
    switch (sortKey) {
      case "relevance":
        arr.sort((a, b) => b.relevance_score - a.relevance_score)
        break
      case "faceless":
        arr.sort((a, b) => b.faceless_score - a.faceless_score)
        break
      case "activity":
        arr.sort((a, b) => (a.metrics.days_since_upload ?? 9999) - (b.metrics.days_since_upload ?? 9999))
        break
      case "views":
        arr.sort((a, b) => b.metrics.median_recent_views - a.metrics.median_recent_views)
        break
      case "consistency":
        arr.sort((a, b) => b.metrics.upload_frequency_per_week - a.metrics.upload_frequency_per_week)
        break
      default:
        arr.sort((a, b) => b.score - a.score)
    }
    return arr
  }, [results, sortKey])

  return (
    <div className="flex flex-col overflow-auto">
      <Header title="Lead Finder" subtitle="Finds active, long-form channels worth contacting — not random keyword matches" />

      <div className="flex-1 overflow-auto p-6">
        {/* Search Form */}
        <Card className="mb-4">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2 space-y-2">
                <Label>Keywords</Label>
                <Input
                  placeholder="e.g. top 10 africa, megaprojects, history explained..."
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
                />
                <p className="text-xs text-muted-foreground">Separate multiple keywords with commas</p>
              </div>

              <div className="space-y-2">
                <Label>Niche Filter</Label>
                <Select value={niche} onValueChange={setNiche}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NICHES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Your Service</Label>
                <Select value={serviceType} onValueChange={(v) => setServiceType(v as ServiceType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Subscribers:</span>
                <Input className="w-24 h-8" placeholder="Min" value={minSubs} onChange={(e) => setMinSubs(e.target.value)} />
                <span className="text-sm text-muted-foreground">to</span>
                <Input className="w-24 h-8" placeholder="Max" value={maxSubs} onChange={(e) => setMaxSubs(e.target.value)} />
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={englishOnly} onChange={(e) => setEnglishOnly(e.target.checked)} className="h-4 w-4 rounded border-input" />
                English only
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={includeLowQuality} onChange={(e) => setIncludeLowQuality(e.target.checked)} className="h-4 w-4 rounded border-input" />
                Show lower quality leads
              </label>

              <label className={`flex items-center gap-2 text-sm cursor-pointer select-none px-3 py-1.5 rounded-lg border transition-colors ${facelessMode ? "border-violet-400 bg-violet-50 text-violet-800" : "border-input"}`}>
                <input type="checkbox" checked={facelessMode} onChange={(e) => setFacelessMode(e.target.checked)} className="h-4 w-4 rounded border-input" />
                <Ghost className="h-3.5 w-3.5" />
                Faceless channels only
              </label>

              <Button onClick={handleDiscover} disabled={loading} className="ml-auto">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                {loading ? "Analyzing..." : "Discover Leads"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Keyword Ideas Panel */}
        <Card className="mb-6">
          <CardContent className="pt-4 pb-4">
            <button
              className="flex items-center justify-between w-full text-sm font-medium text-left"
              onClick={() => setShowIdeas(!showIdeas)}
            >
              <span className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                Not sure what to search? Get keyword ideas
              </span>
              {showIdeas ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {showIdeas && (
              <div className="mt-4 space-y-4">
                {/* AI describe box */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Describe the type of channel you want to find:</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder='e.g. "faceless channels about Africa that make top 10 videos"'
                      value={ideaPrompt}
                      onChange={(e) => setIdeaPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleGenerateIdeas()}
                      className="flex-1"
                    />
                    <Button
                      variant="secondary"
                      onClick={handleGenerateIdeas}
                      disabled={generatingIdeas || !ideaPrompt.trim()}
                    >
                      {generatingIdeas
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <><Sparkles className="h-4 w-4 mr-1" /> Generate</>
                      }
                    </Button>
                  </div>
                </div>

                {/* Preset templates */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Or pick a preset:</p>
                  <div className="flex flex-wrap gap-2">
                    {KEYWORD_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => {
                          setKeywords(preset.keywords)
                          if (preset.faceless) setFacelessMode(true)
                        }}
                        className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:bg-muted transition-colors text-left"
                      >
                        {preset.label}
                        {preset.faceless && <Ghost className="h-3 w-3 text-violet-500 ml-0.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expanded concepts banner */}
        {!loading && expandedConcepts.length > 0 && (
          <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
              <span className="text-sm font-semibold text-violet-800">AI-expanded search concepts</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {expandedConcepts.map((c) => (
                <span key={c} className="inline-block rounded-full bg-violet-100 px-2.5 py-0.5 text-xs text-violet-700 font-medium">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm font-medium">{facelessMode ? "Hunting faceless channels..." : "Researching channels..."}</p>
              <p className="text-xs text-muted-foreground mt-1">Searching videos → collecting channels → analyzing recent content → scoring quality</p>
            </div>
          </div>
        )}

        {/* Empty after search */}
        {!loading && hasSearched && sortedResults.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No qualifying leads</p>
            <p className="text-sm">
              {meta ? `Analyzed ${meta.analyzed}, excluded ${meta.excluded} inactive/weak channels.` : ""} Try enabling &quot;Show lower quality leads&quot; or broadening your filters.
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && sortedResults.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{sortedResults.length}</span> qualified leads
                {meta && <span> · analyzed {meta.analyzed} · excluded {meta.excluded} weak</span>}
              </p>
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                  <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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

        {/* First load */}
        {!hasSearched && (
          <div className="text-center py-16">
            <Search className="h-16 w-16 mx-auto mb-4 text-muted-foreground/20" />
            <h3 className="text-lg font-semibold mb-2">Find Channels Worth Contacting</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Use the keyword ideas panel above to get started, or type your own keywords.
              Enable &quot;Faceless channels only&quot; to find stock-footage and voiceover channels.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
