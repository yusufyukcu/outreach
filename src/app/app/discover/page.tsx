"use client"
import { useState } from "react"
import { Search, Loader2, SlidersHorizontal } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { ChannelCard } from "@/components/leads/channel-card"
import { toast } from "@/hooks/use-toast"
import type { Channel, ServiceType } from "@/types"

const NICHES = [
  "Any Niche", "Technology", "Personal Finance", "Health & Fitness", "Food & Cooking",
  "Gaming", "Travel & Vlogging", "Beauty & Fashion", "Business", "Education",
  "Music", "Comedy", "News & Politics", "Sports", "Real Estate", "Lifestyle",
]

export default function DiscoverPage() {
  const [keywords, setKeywords] = useState("")
  const [niche, setNiche] = useState("Any Niche")
  const [minSubs, setMinSubs] = useState("10000")
  const [maxSubs, setMaxSubs] = useState("500000")
  const [serviceType, setServiceType] = useState<ServiceType>("editing")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<(Channel & { score: number })[]>([])
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
          keywords: keywords.split(",").map(k => k.trim()).filter(Boolean),
          niche: niche === "Any Niche" ? "" : niche,
          min_subscribers: parseInt(minSubs) || 10000,
          max_subscribers: parseInt(maxSubs) || 500000,
          service_type: serviceType,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Discovery failed")

      setResults(data.channels ?? [])
      if (data.channels?.length === 0) {
        toast({ title: "No channels found", description: "Try different keywords or expand your filters" })
      } else {
        toast({ title: `Found ${data.channels.length} channels`, description: "Sorted by lead score" })
      }
    } catch (err) {
      toast({ title: "Discovery failed", description: err instanceof Error ? err.message : "Check YouTube API key", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function handleAddToLeads(channel: Channel & { score: number }) {
    setAddingId(channel.id)
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channel.id,
          score: channel.score,
          score_breakdown: null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setAddedIds(prev => new Set([...prev, channel.id]))
      toast({ title: "Added to leads!", description: `${channel.name} is now in your pipeline` })
    } catch {
      toast({ title: "Failed to add lead", variant: "destructive" })
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="flex flex-col overflow-auto">
      <Header title="Lead Finder" subtitle="Discover YouTube channels that need your services" />

      <div className="flex-1 overflow-auto p-6">
        {/* Search Form */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2 space-y-2">
                <Label>Keywords</Label>
                <Input
                  placeholder="e.g. personal finance, productivity, fitness..."
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleDiscover()}
                />
                <p className="text-xs text-muted-foreground">Separate multiple keywords with commas</p>
              </div>

              <div className="space-y-2">
                <Label>Niche Filter</Label>
                <Select value={niche} onValueChange={setNiche}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Your Service</Label>
                <Select value={serviceType} onValueChange={v => setServiceType(v as ServiceType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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

            <div className="mt-4 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Subscribers:</span>
                <Input
                  className="w-28 h-8"
                  placeholder="Min (10K)"
                  value={minSubs}
                  onChange={e => setMinSubs(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  className="w-28 h-8"
                  placeholder="Max (500K)"
                  value={maxSubs}
                  onChange={e => setMaxSubs(e.target.value)}
                />
              </div>

              <Button onClick={handleDiscover} disabled={loading} className="ml-auto">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                {loading ? "Searching..." : "Discover Channels"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm font-medium">Searching YouTube...</p>
              <p className="text-xs text-muted-foreground mt-1">Analyzing channels and scoring leads</p>
            </div>
          </div>
        )}

        {!loading && hasSearched && results.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No channels found</p>
            <p className="text-sm">Try different keywords or check your YouTube API configuration</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{results.length}</span> channels found · Sorted by lead score
              </p>
              <p className="text-xs text-muted-foreground">{addedIds.size} added to leads</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.map(channel => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  onAddToLeads={handleAddToLeads}
                  isAdded={addedIds.has(channel.id)}
                  isLoading={addingId === channel.id}
                />
              ))}
            </div>
          </div>
        )}

        {!hasSearched && (
          <div className="text-center py-16">
            <Search className="h-16 w-16 mx-auto mb-4 text-muted-foreground/20" />
            <h3 className="text-lg font-semibold mb-2">Find Your Perfect Leads</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Enter keywords related to your target niche. The AI will score each channel based on growth, budget signals, and how much they need your specific service.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
