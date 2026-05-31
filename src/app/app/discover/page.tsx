"use client"
import { useState, useMemo } from "react"
import { Search, Loader2, SlidersHorizontal, ArrowUpDown, Sparkles } from "lucide-react"
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

type SortKey = "score" | "relevance" | "activity" | "views" | "consistency"

export default function DiscoverPage() {
  const [keywords, setKeywords] = useState("")
  const [niche, setNiche] = useState("Any Niche")
  const [minSubs, setMinSubs] = useState("10000")
  const [maxSubs, setMaxSubs] = useState("500000")
  const [serviceType, setServiceType] = useState<ServiceType>("editing")
  const [englishOnly, setEnglishOnly] = useState(true)
  const [includeLowQuality, setIncludeLowQuality] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("score")

  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<DiscoveredLead[]>([])
  const [meta, setMeta] = useState<{ analyzed: number; excluded: number } | null>(null)
  const [expandedConcepts, setExpandedConcepts] = useState<string[]>([])
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [addingId, setAddingId] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

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
          min_score: 75,
          include_low_quality: includeLowQuality,
          english_only: englishOnly,
          min_recent_views: 2000,
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
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2 space-y-2">
                <Label>Keywords</Label>
                <Input
                  placeholder="e.g. personal finance, productivity, documentary..."
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

              <Button onClick={handleDiscover} disabled={loading} className="ml-auto">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                {loading ? "Analyzing..." : "Discover Leads"}
              </Button>
            </div>
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
              <p className="text-sm font-medium">Researching channels...</p>
              <p className="text-xs text-muted-foreground mt-1">Fetching recent videos, checking activity, scoring quality</p>
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
              The finder fetches each channel&apos;s recent videos, filters out inactive and Shorts-only channels,
              verifies the niche, and scores real lead quality — so you only see channels likely to need editing.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
