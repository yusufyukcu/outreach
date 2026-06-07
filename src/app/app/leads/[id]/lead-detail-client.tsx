"use client"
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft, Users, Eye, TrendingUp, PlayCircle, Mail, AtSign,
  Globe, DollarSign, BarChart3, MessageSquare,
  Clock, Reply,
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ScoreBreakdownPanel } from "@/components/leads/score-breakdown-panel"
import { OutreachGenerator } from "@/components/outreach/outreach-generator"
import { formatNumber, formatCurrency, timeAgo } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import type { Lead, Activity, CRMStage, ScoreBreakdown, ServiceType, OutreachMessage } from "@/types"

const STAGE_OPTIONS: { value: CRMStage; label: string }[] = [
  { value: "new",       label: "New" },
  { value: "analyzed",  label: "Analyzed" },
  { value: "contacted", label: "Contacted" },
  { value: "replied",   label: "Replied" },
  { value: "lost",      label: "Lost" },
]

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  lead_created: <Users className="h-3.5 w-3.5" />,
  stage_changed: <BarChart3 className="h-3.5 w-3.5" />,
  email_sent: <Mail className="h-3.5 w-3.5" />,
  email_replied: <Reply className="h-3.5 w-3.5" />,
  note_added: <MessageSquare className="h-3.5 w-3.5" />,
  score_updated: <TrendingUp className="h-3.5 w-3.5" />,
  default: <Clock className="h-3.5 w-3.5" />,
}

function activityLabel(activity: Activity): string {
  const m = activity.metadata as Record<string, string>
  switch (activity.type) {
    case "lead_created": return "Lead added to pipeline"
    case "stage_changed": return `Moved to ${m.to ?? "new stage"}`
    case "email_sent": return `Email sent: "${m.subject ?? ""}"`
    case "email_replied": return `Reply received from ${m.from ?? "lead"}`
    case "note_added": return "Note added"
    case "score_updated": return `Score updated to ${m.score}`
    default: return activity.type.replace(/_/g, " ")
  }
}

interface LeadDetailClientProps {
  lead: Lead
  activities: Activity[]
  messages: OutreachMessage[]
  serviceType: ServiceType
  orgId: string
}

export function LeadDetailClient({ lead: initialLead, activities: initialActivities, messages, serviceType, orgId }: LeadDetailClientProps) {
  const [lead, setLead] = useState(initialLead)
  const [activities, setActivities] = useState(initialActivities)
  const [note, setNote] = useState(lead.notes ?? "")
  const [savingNote, setSavingNote] = useState(false)
  const [updatingStage, setUpdatingStage] = useState(false)

  const channel = lead.channel!
  const contact = lead.contact

  async function handleStageChange(newStage: CRMStage) {
    setUpdatingStage(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crm_stage: newStage }),
      })
      if (!res.ok) throw new Error()
      setLead(prev => ({ ...prev, crm_stage: newStage }))
      toast({ title: "Stage updated" })
    } catch {
      toast({ title: "Failed to update stage", variant: "destructive" })
    } finally {
      setUpdatingStage(false)
    }
  }

  async function handleSaveNote() {
    setSavingNote(true)
    try {
      await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: note }),
      })
      toast({ title: "Note saved" })
    } catch {
      toast({ title: "Failed to save note", variant: "destructive" })
    } finally {
      setSavingNote(false)
    }
  }

  const [activeTab, setActiveTab] = useState("outreach")

  const scoreColor = (lead.lead_score ?? 0) >= 80
    ? "from-emerald-500 to-teal-400"
    : (lead.lead_score ?? 0) >= 60
    ? "from-indigo-500 to-violet-400"
    : "from-amber-500 to-orange-400"

  function statusPillStyle(status: string): React.CSSProperties {
    if (status === "replied") return { background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }
    if (status === "opened") return { background: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)" }
    if (status === "sent" || status === "delivered") return { background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" }
    return { background: "rgba(255,255,255,0.06)", color: "var(--sl-fg-3)", border: "1px solid rgba(255,255,255,0.08)" }
  }

  const ACTIVITY_GRADIENTS: Record<string, string> = {
    lead_created: "from-indigo-500 to-violet-500",
    stage_changed: "from-amber-500 to-orange-400",
    email_sent: "from-blue-500 to-cyan-400",
    email_replied: "from-emerald-500 to-teal-400",
    note_added: "from-emerald-500 to-teal-400",
    score_updated: "from-rose-500 to-orange-400",
    default: "from-slate-400 to-slate-500",
  }

  const tabs = [
    { value: "outreach", label: "Outreach" },
    { value: "messages", label: `Messages (${messages.length})` },
    { value: "notes", label: "Notes" },
    { value: "activity", label: "Activity" },
    { value: "analysis", label: "AI Analysis" },
  ]

  return (
    <div className="flex flex-col overflow-auto">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 flex items-center gap-4 px-6 py-4" style={{ background: "rgba(13,17,23,0.85)", borderBottom: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
        <Link href="/app/leads">
          <button className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </Link>
        <div className="relative h-10 w-10 overflow-hidden rounded-2xl border bg-muted shrink-0">
          {channel.thumbnail_url ? (
            <Image src={channel.thumbnail_url} alt={channel.name} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <PlayCircle className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold truncate">{channel.name}</h1>
            {channel.niche_primary && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent text-accent-foreground border border-accent">
                {channel.niche_primary}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {channel.handle} · {formatNumber(channel.subscriber_count)} subscribers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-2xl font-bold bg-gradient-to-br ${scoreColor} bg-clip-text text-transparent`}>
            {lead.lead_score}
          </div>
          <Select value={lead.crm_stage} onValueChange={v => handleStageChange(v as CRMStage)} disabled={updatingStage}>
            <SelectTrigger className="w-44 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="space-y-4">
            {/* Channel Stats */}
            <div className="rounded-2xl p-5" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Channel Stats</p>
              <div className="space-y-3">
                {[
                  { icon: Users, label: "Subscribers", value: formatNumber(channel.subscriber_count), gradient: "from-indigo-500 to-violet-500" },
                  { icon: Eye, label: "Avg Views/Video", value: channel.avg_views_30d ? formatNumber(channel.avg_views_30d) : "—", gradient: "from-blue-500 to-cyan-400" },
                  { icon: TrendingUp, label: "30d Growth", value: channel.growth_trend_30d ? `${channel.growth_trend_30d > 0 ? "+" : ""}${channel.growth_trend_30d.toFixed(1)}%` : "—", gradient: "from-emerald-500 to-teal-400" },
                  { icon: DollarSign, label: "Est. Monthly Revenue", value: channel.estimated_monthly_revenue_max ? `~${formatCurrency(channel.estimated_monthly_revenue_max)}` : "—", gradient: "from-amber-500 to-orange-400" },
                ].map(({ icon: Icon, label, value, gradient }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className={`h-6 w-6 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                        <Icon className="h-3 w-3 text-white" />
                      </div>
                      {label}
                    </div>
                    <span className="text-sm font-semibold">{value}</span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1 pt-1">
                  {channel.monetization_enabled && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}>Monetized</span>
                  )}
                  {channel.sponsorship_detected && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" }}>Has Sponsors</span>
                  )}
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div className="rounded-2xl p-5" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Contact Information</p>
              <div className="space-y-2">
                {contact?.email ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a href={`mailto:${contact.email}`} className="text-primary hover:underline truncate">{contact.email}</a>
                    {contact.email_verified && (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}>Verified</span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No email found yet</p>
                )}
                {contact?.twitter_handle && (
                  <div className="flex items-center gap-2 text-sm">
                    <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={`https://twitter.com/${contact.twitter_handle}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@{contact.twitter_handle}</a>
                  </div>
                )}
                {contact?.website_url && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={contact.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{contact.website_url}</a>
                  </div>
                )}
              </div>
            </div>

            {/* Score Breakdown */}
            {lead.score_breakdown && (
              <div className="rounded-2xl p-5" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Score Breakdown</p>
                <ScoreBreakdownPanel breakdown={lead.score_breakdown as ScoreBreakdown} />
              </div>
            )}
          </div>

          {/* Right: Custom Tabs */}
          <div className="lg:col-span-2">
            {/* Tab buttons */}
            <div className="flex gap-1 border-b mb-4 overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                    activeTab === tab.value
                      ? "border-primary gradient-text"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="animate-fade-in">
              {/* Outreach Tab */}
              {activeTab === "outreach" && (
                <OutreachGenerator lead={lead} serviceType={serviceType} orgId={orgId} />
              )}

              {/* Messages Tab */}
              {activeTab === "messages" && (
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <div className="rounded-2xl p-8 text-center" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center mx-auto mb-3 opacity-80">
                        <Mail className="h-6 w-6 text-white" />
                      </div>
                      <p className="text-sm text-muted-foreground">No messages sent yet</p>
                    </div>
                  ) : messages.map(msg => (
                    <div key={msg.id} className="rounded-2xl overflow-hidden" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
                      {/* Sent message */}
                      <div className="p-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(96,165,250,0.05)" }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shrink-0">
                              <Mail className="h-3.5 w-3.5 text-white" />
                            </div>
                            <div>
                              <span className="text-xs font-semibold" style={{ color: "#60a5fa" }}>You · {msg.channel}</span>
                              <span className="text-xs text-muted-foreground ml-2">{timeAgo(msg.created_at)}</span>
                            </div>
                          </div>
                          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={statusPillStyle(msg.status)}>
                            {msg.status}
                          </span>
                        </div>
                        {msg.subject && <p className="text-sm font-semibold mb-1 ml-9">{msg.subject}</p>}
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap ml-9 line-clamp-6">{msg.body}</p>
                      </div>

                      {/* Reply (Gmail-style) */}
                      {msg.status === "replied" && msg.reply_body && (
                        <div className="p-4" style={{ background: "rgba(52,211,153,0.06)" }}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center shrink-0">
                              <Reply className="h-3.5 w-3.5 text-white" />
                            </div>
                            <div>
                              <span className="text-xs font-semibold truncate max-w-[200px] inline-block align-middle" style={{ color: "#34d399" }}>{msg.reply_from ?? "Lead"}</span>
                              {msg.replied_at && (
                                <span className="text-xs text-muted-foreground ml-2">{timeAgo(msg.replied_at)}</span>
                              )}
                            </div>
                          </div>
                          <p className="text-sm whitespace-pre-wrap ml-9" style={{ color: "#a7f3d0" }}>{msg.reply_body}</p>
                        </div>
                      )}

                      {/* "Waiting for reply" indicator */}
                      {msg.status !== "replied" && msg.channel === "email" && (
                        <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: "rgba(255,255,255,0.02)" }}>
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                          <span className="text-xs text-muted-foreground">Waiting for reply</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Notes Tab */}
              {activeTab === "notes" && (
                <div className="rounded-2xl p-5" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Textarea
                    placeholder="Add internal notes about this lead..."
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    rows={8}
                    className="mb-3 rounded-xl"
                  />
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold btn-glow disabled:opacity-60 transition-all"
                  >
                    {savingNote ? "Saving..." : "Save Notes"}
                  </button>
                </div>
              )}

              {/* Activity Tab */}
              {activeTab === "activity" && (
                <div className="rounded-2xl p-5" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {activities.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
                  ) : (
                    <div className="space-y-3">
                      {activities.map(activity => (
                        <div key={activity.id} className="flex items-start gap-3">
                          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${ACTIVITY_GRADIENTS[activity.type] ?? ACTIVITY_GRADIENTS.default} text-white`}>
                            {ACTIVITY_ICONS[activity.type] ?? ACTIVITY_ICONS.default}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm">{activityLabel(activity)}</p>
                            <p className="text-xs text-muted-foreground">{timeAgo(activity.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Analysis Tab */}
              {activeTab === "analysis" && (
                <div className="rounded-2xl p-5 space-y-4" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">AI Channel Analysis</p>
                  {channel.analysis_summary ? (
                    <div className="rounded-2xl p-4" style={{ background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.15)" }}>
                      <p className="text-sm" style={{ color: "#bfdbfe" }}>{channel.analysis_summary}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No analysis available yet</p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Editing Quality", score: channel.editing_quality_score },
                      { label: "Thumbnail Quality", score: channel.thumbnail_quality_score },
                      { label: "Outsourcing Likelihood", score: channel.outsourcing_likelihood_score },
                      { label: "Upload Frequency", value: channel.upload_frequency_per_week ? `${channel.upload_frequency_per_week}/week` : "—" },
                    ].map(item => {
                      const score = "score" in item ? item.score : undefined
                      const cardStyle: React.CSSProperties = score !== null && score !== undefined
                        ? score >= 80
                          ? { background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }
                          : score >= 60
                          ? { background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)" }
                          : { background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }
                        : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
                      return (
                        <div key={item.label} className="rounded-2xl p-4" style={cardStyle}>
                          <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                          {score !== null && score !== undefined ? (
                            <p className="text-2xl font-bold">{score}<span className="text-sm text-muted-foreground font-normal">/100</span></p>
                          ) : (
                            <p className="text-2xl font-bold">{("value" in item ? item.value : "—")}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
