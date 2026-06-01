import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/layout/header"
import { Users, Mail, Flame, DollarSign, Target, TrendingUp, ArrowRight, Circle } from "lucide-react"
import Link from "next/link"
import { formatCurrency, getScoreColor } from "@/lib/utils"
import type { CRMStage, Lead } from "@/types"

const STAGE_LABELS: Record<CRMStage, string> = {
  new: "New", analyzed: "Analyzed", contacted: "Contacted", replied: "Replied",
  interested: "Interested", meeting_scheduled: "Meeting", proposal_sent: "Proposal",
  won: "Won", lost: "Lost",
}

const STAGE_COLORS: Record<CRMStage, string> = {
  new: "#94a3b8", analyzed: "#60a5fa", contacted: "#fbbf24",
  replied: "#a78bfa", interested: "#818cf8", meeting_scheduled: "#fb923c",
  proposal_sent: "#f472b6", won: "#34d399", lost: "#f87171",
}

const STAT_GRADIENTS = [
  "from-indigo-500 to-violet-500",
  "from-rose-500 to-orange-400",
  "from-sky-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, full_name, organizations(name)")
    .eq("id", user.id)
    .single() as { data: { org_id: string; full_name: string | null; organizations: { name: string } | null } | null }

  const orgId = profile?.org_id
  if (!orgId) return <div>No organization found.</div>

  const { data: leads } = await supabase
    .from("leads")
    .select("*, channel:channels(name, subscriber_count, thumbnail_url, niche_primary)")
    .eq("org_id", orgId)
    .order("lead_score", { ascending: false, nullsFirst: false })
    .limit(100)

  const allLeads = (leads ?? []) as Lead[]
  const weekAgo = new Date(Date.now() - 7 * 86400000)
  const monthAgo = new Date(Date.now() - 30 * 86400000)

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

  const hotLeads = allLeads.filter(l => (l.lead_score ?? 0) >= 70).slice(0, 6)

  const statCards = [
    { title: "Total Leads", value: stats.total, icon: Users, suffix: "", gradient: STAT_GRADIENTS[0] },
    { title: "Hot Leads", value: stats.hotLeads, icon: Flame, suffix: "", gradient: STAT_GRADIENTS[1] },
    { title: "Contacted / Week", value: stats.contactedThisWeek, icon: Mail, suffix: "", gradient: STAT_GRADIENTS[2] },
    { title: "Pipeline Value", value: stats.pipelineValue, icon: DollarSign, isCurrency: true, gradient: STAT_GRADIENTS[3] },
  ]

  const pipelineStages: CRMStage[] = ["new", "analyzed", "contacted", "replied", "interested", "won"]
  const maxCount = Math.max(...pipelineStages.map(s => stageCounts[s] ?? 0), 1)

  const firstName = profile?.full_name?.split(" ")[0]

  return (
    <div className="flex flex-col overflow-auto">
      <Header
        title={`${firstName ? `Hey, ${firstName} 👋` : "Dashboard"}`}
        subtitle={profile?.organizations?.name ?? "Your Agency"}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          {statCards.map((card, i) => (
            <div
              key={card.title}
              className="animate-fade-in-up card-hover rounded-2xl bg-white border p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-sm`}>
                  <card.icon className="h-4 w-4 text-white" />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight">
                {card.isCurrency ? formatCurrency(card.value) : card.value}
              </p>
              <div className="mt-2 h-1 rounded-full overflow-hidden bg-muted">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${card.gradient} transition-all duration-700`}
                  style={{ width: card.value > 0 ? `${Math.min(100, (card.value / Math.max(stats.total, 1)) * 100 * 4)}%` : "0%" }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Pipeline funnel */}
          <div className="lg:col-span-3 animate-fade-in-up rounded-2xl bg-white border p-6" style={{ animationDelay: "150ms" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold">Pipeline Overview</h2>
              <Link href="/app/pipeline" className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                View board <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-2.5">
              {pipelineStages.map((stage) => {
                const count = stageCounts[stage] ?? 0
                const pct = count > 0 ? Math.max(5, Math.round((count / maxCount) * 100)) : 0
                return (
                  <Link href="/app/pipeline" key={stage} className="flex items-center gap-3 group">
                    <div className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center">
                      <Circle className="h-2 w-2" fill={STAGE_COLORS[stage]} style={{ color: STAGE_COLORS[stage] }} />
                    </div>
                    <span className="w-24 text-xs text-muted-foreground shrink-0">{STAGE_LABELS[stage]}</span>
                    <div className="flex-1 h-5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 flex items-center px-2.5"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${STAGE_COLORS[stage]}cc, ${STAGE_COLORS[stage]})`,
                        }}
                      >
                        {count > 0 && <span className="text-[10px] font-bold text-white leading-none">{count}</span>}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Hot leads */}
          <div className="lg:col-span-2 animate-fade-in-up rounded-2xl bg-white border overflow-hidden" style={{ animationDelay: "200ms" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                Hot Leads
              </h2>
              <Link href="/app/leads" className="text-xs text-primary hover:underline font-medium">View all</Link>
            </div>
            {hotLeads.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No high-scored leads yet.{" "}
                <Link href="/app/discover" className="text-primary hover:underline">Discover channels →</Link>
              </div>
            ) : (
              <div className="divide-y stagger-children">
                {hotLeads.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/app/leads/${lead.id}`}
                    className="animate-fade-in flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {lead.channel?.name ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{lead.channel?.niche_primary ?? "Unknown"}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-sm font-bold tabular-nums ${getScoreColor(lead.lead_score ?? 0)}`}>
                        {lead.lead_score ?? "?"}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Empty state */}
        {allLeads.length === 0 && (
          <div className="animate-fade-in-up rounded-2xl border-2 border-dashed border-primary/20 bg-primary/5 p-12 text-center">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center mx-auto mb-5 animate-float">
              <Target className="h-7 w-7 text-white" />
            </div>
            <h3 className="text-lg font-bold mb-2">Start finding leads</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-xs mx-auto">
              Discover YouTube channels in your niche and start filling your pipeline
            </p>
            <Link href="/app/discover">
              <button className="btn-glow inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all"
                style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}>
                <TrendingUp className="h-4 w-4" />
                Find Your First Leads
              </button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
