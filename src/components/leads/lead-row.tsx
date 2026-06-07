"use client"
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { PlayCircle, Mail, Copy, Check, Loader2, ChevronDown, ChevronUp, Send, Bell, ExternalLink, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { formatNumber, timeAgo } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import type { Lead, CRMStage } from "@/types"

const STAGE_STYLES: Record<CRMStage, { bg: string; color: string; dot: string }> = {
  new:       { bg: "rgba(148,163,184,0.12)", color: "#94a3b8", dot: "bg-slate-400" },
  analyzed:  { bg: "rgba(96,165,250,0.12)",  color: "#60a5fa", dot: "bg-blue-400" },
  contacted: { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24", dot: "bg-amber-400" },
  replied:   { bg: "rgba(167,139,250,0.12)", color: "#a78bfa", dot: "bg-violet-400" },
  lost:      { bg: "rgba(248,113,113,0.12)", color: "#f87171", dot: "bg-red-400" },
}

const STAGE_LABELS: Record<CRMStage, string> = {
  new: "New", analyzed: "Analyzed", contacted: "Contacted",
  replied: "Replied", lost: "Lost",
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
  onDelete?: (id: string) => void
  serviceType?: string
  needsFollowup?: boolean
  gmailConnected?: boolean
}

export function LeadRow({ lead, selected, onSelect, onDelete, serviceType, needsFollowup, gmailConnected }: LeadRowProps) {
  const channel = lead.channel
  const contact = lead.contact

  const [emailOpen, setEmailOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<{ subject: string; body: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [marking, setMarking] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  async function handleSend(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    if (!generated || !contact?.email) return
    setSending(true)
    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: contact.email, subject: generated.subject, body: generated.body, lead_id: lead.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to send")
      toast({ title: "Email sent!", description: `Sent to ${contact.email}` })
      setEmailOpen(false)
    } catch (err) {
      toast({ title: "Failed to send", description: err instanceof Error ? err.message : "", variant: "destructive" })
    } finally { setSending(false) }
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

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      onDelete?.(lead.id)
      toast({ title: "Lead deleted" })
    } catch {
      toast({ title: "Failed to delete lead", variant: "destructive" })
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const stage = STAGE_STYLES[lead.crm_stage]

  // Build a link to the channel's YouTube page — prefer the @handle, fall back
  // to the canonical /channel/<id> URL.
  const youtubeUrl = channel
    ? channel.handle
      ? `https://www.youtube.com/${channel.handle.startsWith("@") ? channel.handle : "@" + channel.handle}`
      : `https://www.youtube.com/channel/${channel.youtube_channel_id}`
    : null

  return (
    <div className={`last:border-0 transition-colors ${needsFollowup ? "" : ""}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: needsFollowup ? "rgba(251,191,36,0.04)" : undefined }}>
      <div className="flex items-center gap-3 px-4 py-3 transition-colors group" style={{ cursor: "default" }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)" }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "" }}>
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
            {lead.tags?.includes("core") && (
              <span className="hidden sm:inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
                🎯 Core Match
              </span>
            )}
            {lead.tags?.includes("adjacent") && (
              <span className="hidden sm:inline-flex items-center rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-[11px] font-medium text-violet-600">
                🔗 Adjacent Match
              </span>
            )}
            {lead.tags?.includes("wildcard") && (
              <span className="hidden sm:inline-flex items-center rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[11px] font-medium text-orange-600">
                🔥 Experimental
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
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: stage.bg, color: stage.color }}>
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

        {/* Open YouTube channel */}
        {youtubeUrl && (
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open YouTube channel"
            className="pressable shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all"
            style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "var(--sl-fg-3)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f87171"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(248,113,113,0.4)" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--sl-fg-3)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)" }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">YouTube</span>
          </a>
        )}

        {/* Delete */}
        <button
          onClick={handleDelete}
          onBlur={() => setConfirmDelete(false)}
          disabled={deleting}
          title={confirmDelete ? "Click again to confirm" : "Delete lead"}
          className="pressable shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all"
          style={confirmDelete
            ? { background: "#ef4444", color: "white", border: "1px solid #ef4444" }
            : { border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "var(--sl-fg-3)" }}
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          {confirmDelete && <span className="hidden sm:inline">Confirm?</span>}
        </button>

        {/* Quick email */}
        <button
          onClick={handleQuickEmail}
          className="pressable shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all"
          style={emailOpen
            ? { background: "hsl(243 75% 59%)", color: "white" }
            : { border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "var(--sl-fg-3)" }}
        >
          <Mail className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Email</span>
          {emailOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Inline email panel */}
      {emailOpen && (
        <div className="animate-fade-in px-4 pb-4 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
          {generating ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Generating personalized email...
            </div>
          ) : generated ? (
            <div className="space-y-2 pt-2">
              <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
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
                  {copied ? <><Check className="h-3.5 w-3.5 mr-1.5" />Copied!</> : <><Copy className="h-3.5 w-3.5 mr-1.5" />Copy</>}
                </Button>
                {contact?.email ? (
                  <Button
                    size="sm"
                    onClick={gmailConnected ? handleSend : () => window.location.href = "/app/settings"}
                    disabled={sending}
                    className="flex-1 rounded-xl btn-glow text-white"
                    style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
                    title={gmailConnected ? undefined : "Connect Gmail in Settings to send"}
                  >
                    {sending
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Sending…</>
                      : gmailConnected
                        ? <><Send className="h-3.5 w-3.5 mr-1.5" />Send Email</>
                        : <><Send className="h-3.5 w-3.5 mr-1.5" />Connect Gmail</>}
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleMarkSent} disabled={marking} className="flex-1 rounded-xl">
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    {marking ? "Saving..." : "Mark as Sent"}
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
