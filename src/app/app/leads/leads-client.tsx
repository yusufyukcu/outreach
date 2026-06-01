"use client"
import { useState, useMemo } from "react"
import Link from "next/link"
import { Search, Plus, Mail, Check, Copy, Loader2, X, ChevronDown, ChevronUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
  { value: "followup", label: "🔔 Follow-up Needed" },
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
  leads: Lead[]
  serviceType: ServiceType
}

export function LeadsClient({ leads, serviceType }: LeadsClientProps) {
  const [activeFilter, setActiveFilter] = useState("all")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Bulk email modal
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([])
  const [agencyName, setAgencyName] = useState("")
  const [agencyValueProp, setAgencyValueProp] = useState("")
  const [bulkTone, setBulkTone] = useState<"professional" | "casual" | "direct">("professional")
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set())

  // Leads that need follow-up: contacted 3+ days ago with no reply
  const followupLeads = useMemo(() => {
    const cutoff = new Date(Date.now() - THREE_DAYS_MS).toISOString()
    return leads.filter((l) =>
      l.crm_stage === "contacted" &&
      (l.last_contacted_at ? l.last_contacted_at < cutoff : l.updated_at < cutoff)
    )
  }, [leads])

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: leads.length, followup: followupLeads.length }
    for (const l of leads) {
      counts[l.crm_stage] = (counts[l.crm_stage] ?? 0) + 1
    }
    return counts
  }, [leads, followupLeads])

  const filteredLeads = useMemo(() => {
    if (activeFilter === "all") return leads
    if (activeFilter === "followup") return followupLeads
    return leads.filter((l) => l.crm_stage === (activeFilter as CRMStage))
  }, [leads, followupLeads, activeFilter])

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredLeads.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredLeads.map((l) => l.id)))
    }
  }

  async function handleBulkGenerate() {
    setBulkGenerating(true)
    try {
      const res = await fetch("/api/outreach/bulk-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_ids: [...selectedIds],
          agency_name: agencyName,
          agency_value_prop: agencyValueProp,
          service_type: serviceType,
          tone: bulkTone,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBulkResults(data.results ?? [])
    } catch {
      toast({ title: "Failed to generate emails", variant: "destructive" })
    } finally {
      setBulkGenerating(false)
    }
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

  return (
    <>
      {/* Stage filter tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {STAGE_FILTERS.map((filter) => {
          const count = stageCounts[filter.value] ?? 0
          const isActive = activeFilter === filter.value
          const isFollowup = filter.value === "followup"
          return (
            <button
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? isFollowup ? "bg-amber-500 text-white" : "bg-primary text-white"
                  : isFollowup && count > 0
                    ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                    : "bg-muted hover:bg-muted/70 text-muted-foreground"
              }`}
            >
              {filter.label}
              {count > 0 && (
                <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full text-xs px-1 ${
                  isActive ? "bg-white/20 text-white" : "bg-background"
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
        <div className="ml-auto">
          <Link href="/app/leads?min_score=85">
            <button className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
              🔥 Hot Only (85+)
            </button>
          </Link>
        </div>
      </div>

      {/* Lead list */}
      <div className="rounded-xl border bg-white overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-4 px-4 py-2 bg-muted/50 border-b">
          <input
            type="checkbox"
            checked={filteredLeads.length > 0 && selectedIds.size === filteredLeads.length}
            onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-input"
          />
          <div className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Channel</div>
          <div className="hidden sm:block w-20 text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Score</div>
          <div className="hidden md:block w-28 text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Stage</div>
          <div className="hidden lg:block w-24 text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Last Activity</div>
          <div className="w-20 text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Email</div>
        </div>

        {filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Search className="h-12 w-12 mb-3 opacity-20" />
            <p className="font-medium">
              {activeFilter === "followup" ? "No follow-ups needed right now" : "No leads found"}
            </p>
            <p className="text-sm">
              {activeFilter === "followup"
                ? "All contacted leads have received timely follow-ups."
                : "Start discovering channels to fill your pipeline"}
            </p>
            {activeFilter === "all" && (
              <Link href="/app/discover" className="mt-3 text-sm text-primary hover:underline">
                Discover channels →
              </Link>
            )}
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              selected={selectedIds.has(lead.id)}
              onSelect={toggleSelect}
              serviceType={serviceType}
              needsFollowup={followupLeads.some((f) => f.id === lead.id)}
            />
          ))
        )}
      </div>

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border bg-white shadow-xl px-5 py-3">
          <span className="text-sm font-semibold">{selectedIds.size} selected</span>
          <Button size="sm" onClick={() => { setBulkOpen(true); setBulkResults([]) }}>
            <Mail className="h-4 w-4 mr-2" />
            Generate Emails
          </Button>
          <button onClick={() => setSelectedIds(new Set())} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bulk email modal */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="font-semibold">Generate Emails for {selectedIds.size} Leads</h2>
                <p className="text-xs text-muted-foreground mt-0.5">AI will write a personalized email for each channel</p>
              </div>
              <button onClick={() => setBulkOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Config or results */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {bulkResults.length === 0 ? (
                /* Config panel */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Your Agency Name</Label>
                      <Input
                        placeholder="e.g. Apex Edits"
                        value={agencyName}
                        onChange={(e) => setAgencyName(e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tone</Label>
                      <Select value={bulkTone} onValueChange={(v) => setBulkTone(v as typeof bulkTone)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="casual">Casual & Friendly</SelectItem>
                          <SelectItem value="direct">Direct & Concise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Value Proposition (optional)</Label>
                    <Input
                      placeholder="e.g. We increased retention by 40% for 20+ channels in your niche"
                      value={agencyValueProp}
                      onChange={(e) => setAgencyValueProp(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <Button onClick={handleBulkGenerate} disabled={bulkGenerating} className="w-full">
                    {bulkGenerating
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating {selectedIds.size} emails...</>
                      : <><Mail className="h-4 w-4 mr-2" />Generate {selectedIds.size} Personalized Emails</>
                    }
                  </Button>
                </div>
              ) : (
                /* Results */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{bulkResults.length} emails generated</p>
                    <Button size="sm" variant="outline" onClick={handleCopyAll}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy All
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
    <div className="rounded-lg border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{result.channel_name}</p>
          {result.email && <p className="text-xs text-muted-foreground truncate">{result.email}</p>}
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{result.subject}</p>
        </div>
        <div className="flex items-center gap-1.5 ml-3 shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <Button size="sm" variant={copied ? "secondary" : "default"} onClick={onCopy} className="h-7 px-2.5">
            {copied ? <><Check className="h-3.5 w-3.5 mr-1" />Copied</> : <><Copy className="h-3.5 w-3.5 mr-1" />Copy</>}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t bg-white">
          <p className="text-xs font-semibold text-muted-foreground mt-2 mb-1">SUBJECT</p>
          <p className="text-sm font-medium mb-2">{result.subject}</p>
          <p className="text-xs font-semibold text-muted-foreground mb-1">BODY</p>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{result.body}</p>
        </div>
      )}
    </div>
  )
}
