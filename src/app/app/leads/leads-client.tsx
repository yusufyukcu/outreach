"use client"
import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { Search, Mail, Check, Copy, Loader2, X, ChevronDown, ChevronUp, Bell, Flame, Trophy, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LeadRow } from "@/components/leads/lead-row"
import { toast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import type { Lead, CRMStage, ServiceType } from "@/types"

const STAGE_FILTERS = [
  { value: "all", label: "All Leads" },
  { value: "followup", label: "Follow-up", icon: "🔔" },
  { value: "new", label: "New" },
  { value: "analyzed", label: "Analyzed" },
  { value: "contacted", label: "Contacted" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "won", label: "Won" },
]

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

interface BulkResult {
  lead_id: string
  channel_name: string
  email: string | null
  subject: string
  body: string
}

interface LeadsClientProps {
  serviceType: ServiceType
  initialLeads: Lead[]
}

export function LeadsClient({ serviceType, initialLeads }: LeadsClientProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [loadingLeads] = useState(false)
  const [activeFilter, setActiveFilter] = useState("all")
  const [gmailConnected, setGmailConnected] = useState(false)
  // Captured once on mount so the follow-up cutoff stays stable across renders.
  const [nowMs] = useState(() => Date.now())

  useEffect(() => {
    fetch("/api/gmail/status")
      .then((r) => r.json())
      .then((d) => setGmailConnected(!!d.connected))
      .catch(() => {})
  }, [])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([])
  const [agencyName, setAgencyName] = useState("")
  const [agencyValueProp, setAgencyValueProp] = useState("")
  const [bulkTone, setBulkTone] = useState<"professional" | "casual" | "direct">("professional")
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set())

  const followupLeads = useMemo(() => {
    const cutoff = new Date(nowMs - THREE_DAYS_MS).toISOString()
    return leads.filter((l) =>
      l.crm_stage === "contacted" &&
      (l.last_contacted_at ? l.last_contacted_at < cutoff : l.updated_at < cutoff)
    )
  }, [leads, nowMs])

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: leads.length, followup: followupLeads.length }
    for (const l of leads) counts[l.crm_stage] = (counts[l.crm_stage] ?? 0) + 1
    return counts
  }, [leads, followupLeads])

  const filteredLeads = useMemo(() => {
    if (activeFilter === "all") return leads
    if (activeFilter === "followup") return followupLeads
    return leads.filter((l) => l.crm_stage === (activeFilter as CRMStage))
  }, [leads, followupLeads, activeFilter])

  function handleDeleteLead(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id))
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => { const n = new Set(prev); if (checked) n.add(id); else n.delete(id); return n })
  }
  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === filteredLeads.length ? new Set() : new Set(filteredLeads.map((l) => l.id)))
  }

  async function handleBulkGenerate() {
    setBulkGenerating(true)
    try {
      const res = await fetch("/api/outreach/bulk-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: [...selectedIds], agency_name: agencyName, agency_value_prop: agencyValueProp, service_type: serviceType, tone: bulkTone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBulkResults(data.results ?? [])
    } catch {
      toast({ title: "Failed to generate emails", variant: "destructive" })
    } finally { setBulkGenerating(false) }
  }

  async function handleCopyOne(result: BulkResult) {
    await navigator.clipboard.writeText(`Subject: ${result.subject}\n\n${result.body}`)
    setCopiedIds((prev) => new Set([...prev, result.lead_id]))
    toast({ title: `Copied email for ${result.channel_name}` })
  }

  async function handleCopyAll() {
    const all = bulkResults.map((r) =>
      `=== ${r.channel_name} ===\nTo: ${r.email ?? "(no email)"}\nSubject: ${r.subject}\n\n${r.body}`
    ).join("\n\n---\n\n")
    await navigator.clipboard.writeText(all)
    toast({ title: `Copied ${bulkResults.length} emails to clipboard` })
  }

  const hotCount = leads.filter((l) => (l.lead_score ?? 0) >= 85).length
  const wonCount = leads.filter((l) => l.crm_stage === "won").length

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          {
            label: "Total Leads",
            value: leads.length,
            icon: Users,
            gradient: "from-indigo-500 to-violet-500",
            glow: "hsl(243 75% 59% / 0.25)",
            bg: "from-indigo-50 to-violet-50",
            filter: "all",
          },
          {
            label: "Hot Leads",
            value: hotCount,
            icon: Flame,
            gradient: "from-rose-500 to-orange-400",
            glow: "hsl(350 80% 60% / 0.25)",
            bg: "from-rose-50 to-orange-50",
            filter: "all",
            hotOnly: true,
          },
          {
            label: "Follow-ups",
            value: stageCounts["followup"] ?? 0,
            icon: Bell,
            gradient: "from-amber-400 to-yellow-400",
            glow: "hsl(38 90% 55% / 0.25)",
            bg: "from-amber-50 to-yellow-50",
            filter: "followup",
          },
          {
            label: "Won",
            value: wonCount,
            icon: Trophy,
            gradient: "from-emerald-500 to-teal-400",
            glow: "hsl(160 80% 45% / 0.25)",
            bg: "from-emerald-50 to-teal-50",
            filter: "won",
          },
        ].map((card) => {
          const Icon = card.icon
          const isActive = activeFilter === card.filter && !card.hotOnly
          return (
            <button
              key={card.label}
              onClick={() => {
                if (card.hotOnly) {
                  setActiveFilter("all")
                } else {
                  setActiveFilter(card.filter)
                }
              }}
              className="pressable relative text-left rounded-2xl border bg-white p-4 shadow-sm overflow-hidden transition-all duration-200"
              style={isActive ? { boxShadow: `0 0 0 2px ${card.glow.replace("0.25", "0.8")}, 0 4px 20px ${card.glow}` } : {}}
            >
              {/* subtle bg gradient */}
              <div className={`absolute inset-0 bg-gradient-to-br ${card.bg} opacity-0 transition-opacity duration-200 ${isActive ? "opacity-100" : ""}`} />
              <div className="relative">
                <div
                  className={`h-9 w-9 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-3 shadow-md`}
                  style={{ boxShadow: `0 4px 14px ${card.glow}` }}
                >
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <p className="text-2xl font-extrabold tabular-nums leading-none mb-1">{card.value}</p>
                <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              </div>
              {/* 3D decorative orb */}
              <div
                className={`absolute -right-3 -bottom-3 h-16 w-16 rounded-full bg-gradient-to-br ${card.gradient} opacity-10`}
              />
              <div
                className={`absolute -right-1 -bottom-1 h-8 w-8 rounded-full bg-gradient-to-br ${card.gradient} opacity-15`}
              />
            </button>
          )
        })}
      </div>

      {/* Stage filter pills */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {STAGE_FILTERS.map((filter) => {
          const count = stageCounts[filter.value] ?? 0
          const isActive = activeFilter === filter.value
          const isFollowup = filter.value === "followup"
          return (
            <button
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              className={`pressable inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 ${
                isActive
                  ? isFollowup
                    ? "bg-amber-500 text-white"
                    : "bg-foreground text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              {isFollowup && <Bell className="h-3 w-3" />}
              {filter.label}
              {count > 0 && (
                <span className={`text-[10px] font-bold tabular-nums ${isActive ? "opacity-70" : "opacity-60"}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Lead list */}
      <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/40 border-b">
          <input
            type="checkbox"
            checked={filteredLeads.length > 0 && selectedIds.size === filteredLeads.length}
            onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-input accent-indigo-600"
          />
          <div className="flex-1 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Channel</div>
          <div className="hidden sm:block w-12 text-[11px] font-bold text-muted-foreground uppercase tracking-widest text-right">Score</div>
          <div className="hidden md:block w-28 text-[11px] font-bold text-muted-foreground uppercase tracking-widest text-right">Stage</div>
          <div className="hidden lg:block w-24 text-[11px] font-bold text-muted-foreground uppercase tracking-widest text-right">Activity</div>
          <div className="w-20 text-[11px] font-bold text-muted-foreground uppercase tracking-widest text-right">Email</div>
        </div>

        {loadingLeads ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading leads...</span>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Search className="h-10 w-10 mb-3 opacity-10" />
            <p className="font-semibold">
              {activeFilter === "followup" ? "No follow-ups needed" : "No leads found"}
            </p>
            <p className="text-sm mt-1">
              {activeFilter === "followup"
                ? "All contacted leads are up to date."
                : "Start discovering channels to fill your pipeline"}
            </p>
            {activeFilter === "all" && (
              <Link href="/app/discover" className="mt-4 text-sm text-primary hover:underline font-medium">
                Discover channels →
              </Link>
            )}
          </div>
        ) : (
          <div className="stagger-children">
            {filteredLeads.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                selected={selectedIds.has(lead.id)}
                onSelect={toggleSelect}
                onDelete={handleDeleteLead}
                serviceType={serviceType}
                needsFollowup={followupLeads.some((f) => f.id === lead.id)}
                gmailConnected={gmailConnected}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up flex items-center gap-3 rounded-2xl border bg-white shadow-2xl px-5 py-3">
          <span className="text-sm font-bold">{selectedIds.size} selected</span>
          <Button
            size="sm"
            onClick={() => { setBulkOpen(true); setBulkResults([]) }}
            className="btn-glow rounded-xl"
            style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
          >
            <Mail className="h-4 w-4 mr-2" />
            Generate Emails
          </Button>
          <button onClick={() => setSelectedIds(new Set())} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bulk email modal */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="animate-scale-in w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="font-bold">Generate Emails for {selectedIds.size} Leads</h2>
                <p className="text-xs text-muted-foreground mt-0.5">AI will write a personalized email for each channel</p>
              </div>
              <button onClick={() => setBulkOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {bulkResults.length === 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Your Agency Name</Label>
                      <Input placeholder="e.g. Apex Edits" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} className="h-9 rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Tone</Label>
                      <Select value={bulkTone} onValueChange={(v) => setBulkTone(v as typeof bulkTone)}>
                        <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="casual">Casual & Friendly</SelectItem>
                          <SelectItem value="direct">Direct & Concise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Value Proposition (optional)</Label>
                    <Input
                      placeholder="e.g. We increased retention by 40% for 20+ channels in your niche"
                      value={agencyValueProp}
                      onChange={(e) => setAgencyValueProp(e.target.value)}
                      className="h-9 rounded-xl"
                    />
                  </div>
                  <Button
                    onClick={handleBulkGenerate}
                    disabled={bulkGenerating}
                    className="w-full rounded-xl btn-glow"
                    style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
                  >
                    {bulkGenerating
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating {selectedIds.size} emails...</>
                      : <><Mail className="h-4 w-4 mr-2" />Generate {selectedIds.size} Personalized Emails</>
                    }
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{bulkResults.length} emails generated</p>
                    <Button size="sm" variant="outline" onClick={handleCopyAll} className="rounded-xl">
                      <Copy className="h-3.5 w-3.5 mr-1.5" />Copy All
                    </Button>
                  </div>
                  {bulkResults.map((result) => (
                    <BulkResultCard
                      key={result.lead_id}
                      result={result}
                      copied={copiedIds.has(result.lead_id)}
                      onCopy={() => handleCopyOne(result)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Toaster />
    </>
  )
}

function BulkResultCard({ result, copied, onCopy }: { result: BulkResult; copied: boolean; onCopy: () => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{result.channel_name}</p>
          {result.email && <p className="text-xs text-muted-foreground truncate">{result.email}</p>}
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{result.subject}</p>
        </div>
        <div className="flex items-center gap-1.5 ml-3 shrink-0">
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <Button size="sm" variant={copied ? "secondary" : "default"} onClick={onCopy} className="h-7 px-2.5 rounded-lg">
            {copied ? <><Check className="h-3.5 w-3.5 mr-1" />Copied</> : <><Copy className="h-3.5 w-3.5 mr-1" />Copy</>}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="animate-fade-in px-3 pb-3 border-t bg-white">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-2 mb-1">Subject</p>
          <p className="text-sm font-semibold mb-2">{result.subject}</p>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Body</p>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground leading-relaxed">{result.body}</p>
        </div>
      )}
    </div>
  )
}
