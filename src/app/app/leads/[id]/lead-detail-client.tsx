"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft, Users, Eye, TrendingUp, PlayCircle, Mail, AtSign,
  Globe, DollarSign, BarChart3, MessageSquare,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { LeadScoreBadge } from "@/components/leads/lead-score-badge"
import { ScoreBreakdownPanel } from "@/components/leads/score-breakdown-panel"
import { OutreachGenerator } from "@/components/outreach/outreach-generator"
import { formatNumber, formatCurrency, timeAgo, getScoreLabel } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import type { Lead, Activity, CRMStage, ScoreBreakdown, ServiceType, OutreachMessage } from "@/types"

const STAGE_OPTIONS: { value: CRMStage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "analyzed", label: "Analyzed" },
  { value: "contacted", label: "Contacted" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "meeting_scheduled", label: "Meeting Scheduled" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "won", label: "Won ✓" },
  { value: "lost", label: "Lost" },
]

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  lead_created: <Users className="h-3.5 w-3.5" />,
  stage_changed: <BarChart3 className="h-3.5 w-3.5" />,
  email_sent: <Mail className="h-3.5 w-3.5" />,
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
  const router = useRouter()
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

  return (
    <div className="flex flex-col overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-4 border-b bg-white px-6 py-4">
        <Link href="/app/leads">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="relative h-10 w-10 overflow-hidden rounded-full border bg-muted shrink-0">
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
            <h1 className="text-lg font-semibold truncate">{channel.name}</h1>
            {channel.niche_primary && <Badge variant="secondary">{channel.niche_primary}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {channel.handle} · {formatNumber(channel.subscriber_count)} subscribers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LeadScoreBadge score={lead.lead_score} showLabel size="lg" />
          <Select value={lead.crm_stage} onValueChange={v => handleStageChange(v as CRMStage)} disabled={updatingStage}>
            <SelectTrigger className="w-44">
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
          {/* Left: Channel Analysis */}
          <div className="space-y-4">
            {/* Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Channel Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { icon: Users, label: "Subscribers", value: formatNumber(channel.subscriber_count) },
                  { icon: Eye, label: "Avg Views/Video", value: channel.avg_views_30d ? formatNumber(channel.avg_views_30d) : "—" },
                  { icon: TrendingUp, label: "30d Growth", value: channel.growth_trend_30d ? `${channel.growth_trend_30d > 0 ? "+" : ""}${channel.growth_trend_30d.toFixed(1)}%` : "—" },
                  { icon: DollarSign, label: "Est. Monthly Revenue", value: channel.estimated_monthly_revenue_max ? `~${formatCurrency(channel.estimated_monthly_revenue_max)}` : "—" },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </div>
                    <span className="text-sm font-medium">{value}</span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1 pt-1">
                  {channel.monetization_enabled && <Badge variant="success" className="text-xs">Monetized</Badge>}
                  {channel.sponsorship_detected && <Badge variant="info" className="text-xs">Has Sponsors</Badge>}
                </div>
              </CardContent>
            </Card>

            {/* Contact Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {contact?.email ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={`mailto:${contact.email}`} className="text-primary hover:underline truncate">{contact.email}</a>
                    {contact.email_verified && <Badge variant="success" className="text-xs ml-auto">Verified</Badge>}
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
              </CardContent>
            </Card>

            {/* Lead Score Breakdown */}
            {lead.score_breakdown && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Score Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScoreBreakdownPanel breakdown={lead.score_breakdown as ScoreBreakdown} />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Tabs */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="outreach">
              <TabsList>
                <TabsTrigger value="outreach">Outreach</TabsTrigger>
                <TabsTrigger value="messages">Messages ({messages.length})</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
              </TabsList>

              {/* Outreach Tab */}
              <TabsContent value="outreach" className="mt-4">
                <OutreachGenerator lead={lead} serviceType={serviceType} orgId={orgId} />
              </TabsContent>

              {/* Messages Tab */}
              <TabsContent value="messages" className="mt-4 space-y-3">
                {messages.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No messages sent yet</p>
                    </CardContent>
                  </Card>
                ) : messages.map(msg => (
                  <Card key={msg.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{msg.channel}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant={msg.status === "replied" ? "success" : msg.status === "opened" ? "info" : "secondary"} className="text-xs">
                            {msg.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{timeAgo(msg.created_at)}</span>
                        </div>
                      </div>
                      {msg.subject && <p className="text-sm font-semibold mb-1">{msg.subject}</p>}
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{msg.body}</p>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="mt-4">
                <Card>
                  <CardContent className="pt-4">
                    <Textarea
                      placeholder="Add internal notes about this lead..."
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      rows={8}
                      className="mb-3"
                    />
                    <Button onClick={handleSaveNote} disabled={savingNote} size="sm">
                      {savingNote ? "Saving..." : "Save Notes"}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value="activity" className="mt-4">
                <Card>
                  <CardContent className="pt-4">
                    {activities.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
                    ) : (
                      <div className="space-y-3">
                        {activities.map(activity => (
                          <div key={activity.id} className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
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
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Analysis Tab */}
              <TabsContent value="analysis" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">AI Channel Analysis</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {channel.analysis_summary ? (
                      <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
                        <p className="text-sm text-blue-900">{channel.analysis_summary}</p>
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
                      ].map(item => (
                        <div key={item.label} className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                          {"score" in item && item.score !== null && item.score !== undefined ? (
                            <div>
                              <p className="text-lg font-bold">{item.score}<span className="text-sm text-muted-foreground font-normal">/100</span></p>
                            </div>
                          ) : (
                            <p className="text-lg font-bold">{("value" in item ? item.value : "—")}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}
