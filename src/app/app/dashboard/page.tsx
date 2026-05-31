import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, TrendingUp, Mail, DollarSign, Target, Flame } from "lucide-react"
import Link from "next/link"
import { formatCurrency, formatNumber, getScoreColor } from "@/lib/utils"
import type { CRMStage, Lead } from "@/types"

const STAGE_LABELS: Record<CRMStage, string> = {
  new: "New", analyzed: "Analyzed", contacted: "Contacted", replied: "Replied",
  interested: "Interested", meeting_scheduled: "Meeting", proposal_sent: "Proposal",
  won: "Won", lost: "Lost",
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from("profiles").select("org_id, full_name, organizations(name)").eq("id", user.id).single() as {
    data: { org_id: string; full_name: string | null; organizations: { name: string } | null } | null
  }

  const orgId = profile?.org_id
  if (!orgId) return <div>No organization found.</div>

  const { data: leads } = await supabase
    .from("leads")
    .select("*, channel:channels(name, subscriber_count, thumbnail_url, niche_primary)")
    .eq("org_id", orgId)
    .order("lead_score", { ascending: false, nullsFirst: false })
    .limit(100)

  const allLeads = (leads ?? []) as Lead[]
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const stats = {
    total: allLeads.length,
    hotLeads: allLeads.filter(l => (l.lead_score ?? 0) >= 85).length,
    contactedThisWeek: allLeads.filter(l => l.last_contacted_at && new Date(l.last_contacted_at) > weekAgo).length,
    pipelineValue: allLeads.reduce((sum, l) => sum + (l.deal_value_estimate ?? 0), 0),
    wonThisMonth: allLeads.filter(l => l.crm_stage === "won" && new Date(l.created_at) > monthAgo).length,
  }

  const stageCounts = allLeads.reduce((acc, l) => {
    acc[l.crm_stage] = (acc[l.crm_stage] || 0) + 1
    return acc
  }, {} as Record<CRMStage, number>)

  const hotLeads = allLeads.filter(l => (l.lead_score ?? 0) >= 70).slice(0, 5)

  const statCards = [
    { title: "Total Leads", value: stats.total.toString(), icon: Users, change: "+12 this week", positive: true },
    { title: "Hot Leads (85+)", value: stats.hotLeads.toString(), icon: Flame, change: "Score ≥ 85", positive: true },
    { title: "Contacted This Week", value: stats.contactedThisWeek.toString(), icon: Mail, change: "Outreach sent", positive: true },
    { title: "Pipeline Value", value: formatCurrency(stats.pipelineValue), icon: DollarSign, change: "Estimated deals", positive: true },
  ]

  return (
    <div className="flex flex-col overflow-auto">
      <Header
        title={`Welcome back${profile?.full_name ? ", " + profile.full_name.split(" ")[0] : ""}! 👋`}
        subtitle={profile?.organizations?.name ?? "Your Agency"}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(card => (
            <Card key={card.title}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className="text-2xl font-bold mt-1">{card.value}</p>
                    <p className="text-xs text-emerald-600 mt-1">{card.change}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <card.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pipeline Funnel */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Pipeline Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(Object.entries(STAGE_LABELS) as [CRMStage, string][]).map(([stage, label]) => {
                  const count = stageCounts[stage] ?? 0
                  const max = Math.max(...Object.values(stageCounts), 1)
                  const pct = count > 0 ? Math.max(8, Math.round((count / max) * 100)) : 0
                  return (
                    <Link href={`/app/pipeline`} key={stage} className="flex items-center gap-3 group">
                      <span className="w-28 text-xs text-muted-foreground text-right shrink-0">{label}</span>
                      <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded transition-all group-hover:bg-primary flex items-center px-2"
                          style={{ width: `${pct}%` }}
                        >
                          {count > 0 && <span className="text-xs font-semibold text-white">{count}</span>}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Hot Leads */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Hot Leads</CardTitle>
                <Link href="/app/leads" className="text-xs text-primary hover:underline">View all</Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-0">
              {hotLeads.length === 0 ? (
                <div className="px-6 pb-6 text-sm text-muted-foreground">
                  No high-scored leads yet.{" "}
                  <Link href="/app/discover" className="text-primary hover:underline">Discover channels →</Link>
                </div>
              ) : hotLeads.map(lead => (
                <Link
                  key={lead.id}
                  href={`/app/leads/${lead.id}`}
                  className="flex items-center gap-3 px-6 py-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{lead.channel?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{lead.channel?.niche_primary ?? "Unknown niche"}</p>
                  </div>
                  <span className={`text-sm font-bold ${getScoreColor(lead.lead_score ?? 0)}`}>
                    {lead.lead_score ?? "?"}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        {allLeads.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Target className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No leads yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Start by discovering YouTube channels in your niche</p>
              <Link href="/app/discover">
                <button className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                  <TrendingUp className="h-4 w-4" />
                  Find Your First Leads
                </button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
