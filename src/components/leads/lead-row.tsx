"use client"
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { PlayCircle, Mail, Copy, Check, Loader2, ChevronDown, ChevronUp, Send, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { formatNumber, timeAgo } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import type { Lead, CRMStage } from "@/types"

const STAGE_STYLES: Record<CRMStage, { bg: string; text: string; dot: string }> = {
  new:               { bg: "bg-slate-100",   text: "text-slate-600",   dot: "bg-slate-400" },
  analyzed:          { bg: "bg-blue-50",     text: "text-blue-700",    dot: "bg-blue-400" },
  contacted:         { bg: "bg-amber-50",    text: "text-amber-700",   dot: "bg-amber-400" },
  replied:           { bg: "bg-violet-50",   text: "text-violet-700",  dot: "bg-violet-400" },
  interested:        { bg: "bg-indigo-50",   text: "text-indigo-700",  dot: "bg-indigo-400" },
  meeting_scheduled: { bg: "bg-orange-50",   text: "text-orange-700",  dot: "bg-orange-400" },
  proposal_sent:     { bg: "bg-pink-50",     text: "text-pink-700",    dot: "bg-pink-400" },
  won:               { bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-400" },
  lost:              { bg: "bg-red-50",      text: "text-red-700",     dot: "bg-red-400" },
}

const STAGE_LABELS: Record<CRMStage, string> = {
  new: "New", analyzed: "Analyzed", contacted: "Contacted", replied: "Replied",
  interested: "Interested", meeting_scheduled: "Meeting", proposal_sent: "Proposal",
  won: "Won", lost: "Lost",
}

function ScoreDot({ score }: { score: number | null }) {
  const color =
    (score ?? 0) >= 80 ? "text-emerald-600" :
    (score ?? 0) >= 60 ? "text-indigo-600" :
    (score ?? 0) >= 40 ? "text-amber-500" :
    "text-muted-foreground"
  return <span className={`text-sm font-bold tabular-nums ${color}`}>{score ?? "—"}</span>
}

interface LeadRowProps {
  lead: Lead
  selected?: boolean
  onSelect?: (id: string, checked: boolean) => void
  serviceType?: string
  needsFollowup?: boolean
}

export function LeadRow({ lead, selected, onSelect, serviceType, needsFollowup }: LeadRowProps) {
  const channel = lead.channel
  const contact = lead.contact

  const [emailOpen, setEmailOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<{ subject: string; body: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [marking, setMarking] = useState(false)

  async function handleQuickEmail(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    if (emailOpen && generated) { setEmailOpen(false); return }
    setEmailOpen(true)
    if (generated) return
    setGenerating(true)
    try {
      const res = await fetch("/api/outreach/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, serviceType: serviceType ?? "editing", tone: "professional", outreachChannel: "email", agencyName: "", agencyValueProp: "" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGenerated(data)
    } catch {
      toast({ title: "Could not generate email", variant: "destructive" })
      setEmailOpen(false)
    } finally { setGenerating(false) }
  }

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    if (!generated) return
    await navigator.clipboard.writeText(`Subject: ${generated.subject}\n\n${generated.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({ title: "Copied to clipboard!" })
  }

  async function handleMarkSent(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    if (!generated) return
    setMarking(true)
    try {
      await fetch("/api/outreach/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, channel: "email", subject: generated.subject, body: generated.body, status: "sent" }),
      })
      toast({ title: "Marked as sent", description: "Lead moved to Contacted" })
      setEmailOpen(false)
    } catch {
      toast({ title: "Failed", variant: "destructive" })
    } finally { setMarking(false) }
  }

  const stage = STAGE_STYLES[lead.crm_stage]

  return (
    <div className={`border-b last:border-0 transition-colors ${needsFollowup ? "bg-amber-50/50" : ""}`}>
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group">
        {/* Checkbox */}
        {onSelect && (
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={(e) => { e.stopPropagation(); onSelect(lead.id, e.target.checked) }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-input shrink-0 cursor-pointer accent-indigo-600"
          />
        )}

        {/* Avatar */}
        <Link href={`/app/leads/${lead.id}`} className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border bg-muted">
          {channel?.thumbnail_url ? (
            <Image src={channel.thumbnail_url} alt={channel.name} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <PlayCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </Link>

        {/* Channel info */}
        <Link href={`/app/leads/${lead.id}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
              {channel?.name ?? "Unknown"}
            </p>
            {channel?.niche_primary && (
              <span className="hidden md:inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                {channel.niche_primary}
              </span>
            )}
            {needsFollowup && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                <Bell className="h-2.5 w-2.5" />
                Follow-up
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {channel ? formatNumber(channel.subscriber_count) + " subs" : "—"}
            </span>
            {contact?.email && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                <span className="hidden sm:inline truncate max-w-[140px]">{contact.email}</span>
              </span>
            )}
          </div>
        </Link>

        {/* Score */}
        <div className="hidden sm:block w-12 text-right">
          <ScoreDot score={lead.lead_score} />
        </div>

        {/* Stage */}
        <div className="hidden md:block w-28 text-right">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${stage.bg} ${stage.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
            {STAGE_LABELS[lead.crm_stage]}
          </span>
        </div>

        {/* Last activity */}
        <div className="hidden lg:block w-24 text-right">
          <span className="text-xs text-muted-foreground">
            {lead.last_contacted_at ? timeAgo(lead.last_contacted_at) : timeAgo(lead.created_at)}
          </span>
        </div>

        {/* Quick email */}
        <button
          onClick={handleQuickEmail}
          className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
            emailOpen
              ? "bg-primary text-white shadow-sm"
              : "border border-input bg-white hover:bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          <Mail className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Email</span>
          {emailOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Inline email panel */}
      {emailOpen && (
        <div className="animate-fade-in px-4 pb-4 pt-1 border-t bg-gradient-to-b from-muted/30 to-transparent">
          {generating ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Generating personalized email...
            </div>
          ) : generated ? (
            <div className="space-y-2 pt-2">
              <div className="rounded-xl bg-white border px-3 py-2.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Subject</p>
                <p className="text-sm font-semibold">{generated.subject}</p>
              </div>
              <Textarea
                value={generated.body}
                onChange={(e) => setGenerated(prev => prev ? { ...prev, body: e.target.value } : null)}
                rows={6}
                className="text-sm bg-white rounded-xl"
                onClick={(e) => e.preventDefault()}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleCopy} className="flex-1 rounded-xl">
                  {copied ? <><Check className="h-3.5 w-3.5 mr-1.5" />Copied!</> : <><Copy className="h-3.5 w-3.5 mr-1.5" />Copy Email</>}
                </Button>
                <Button size="sm" onClick={handleMarkSent} disabled={marking} className="flex-1 rounded-xl">
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {marking ? "Saving..." : "Mark as Sent"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
