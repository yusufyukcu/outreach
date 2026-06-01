import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/layout/header"
import {
  Users, Mail, Flame, DollarSign, Target, TrendingUp,
  ArrowRight, Zap, KanbanSquare, Search,
} from "lucide-react"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"
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

const STAT_CONFIG = [
  { title: "Total Leads",       icon: Users,      gradient: "from-indigo-500 to-violet-500",  glow: "hsl(243 75% 59% / 0.3)" },
  { title: "Hot Leads",         icon: Flame,       gradient: "from-rose-500 to-orange-400",    glow: "hsl(350 80% 60% / 0.3)" },
  { title: "Contacted / Week",  icon: Mail,        gradient: "from-sky-500 to-cyan-400",       glow: "hsl(199 90% 55% / 0.3)" },
  { title: "Pipeline Value",    icon: DollarSign,  gradient: "from-emerald-500 to-teal-400",   glow: "hsl(158 64% 50% / 0.3)" },
]

const PIPELINE_STAGES: CRMStage[] = ["new", "analyzed", "contacted", "replied", "interested", "won"]

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
  const weekAgo  = new Date(Date.now() - 7  * 86400000)
  const monthAgo = new Date(Date.now() - 30 * 86400000)

  const stats = {
    total:              allLeads.length,
    hotLeads:           allLeads.filter(l => (l.lead_score ?? 0) >= 85).length,
    contactedThisWeek:  allLeads.filter(l => l.last_contacted_at && new Date(l.last_contacted_at) > weekAgo).length,
    pipelineValue:      allLeads.reduce((s, l) => s + (l.deal_value_estimate ?? 0), 0),
    wonThisMonth:       allLeads.filter(l => l.crm_stage === "won" && new Date(l.created_at) > monthAgo).length,
  }

  const stageCounts = allLeads.reduce((acc, l) => {
    acc[l.crm_stage] = (acc[l.crm_stage] || 0) + 1
    return acc
  }, {} as Record<CRMStage, number>)

  const hotLeads = allLeads.filter(l => (l.lead_score ?? 0) >= 70).slice(0, 6)
  const maxCount = Math.max(...PIPELINE_STAGES.map(s => stageCounts[s] ?? 0), 1)
  const firstName = profile?.full_name?.split(" ")[0]

  const statValues = [
    stats.total,
    stats.hotLeads,
    stats.contactedThisWeek,
    stats.pipelineValue,
  ]

  /* won conversion rate (0-100) */
  const convRate = stats.total > 0 ? Math.round((stats.wonThisMonth / stats.total) * 100) : 0

  return (
    <div className="flex flex-col overflow-auto">
      <Header
        title={firstName ? `Hey, ${firstName} 👋` : "Dashboard"}
        subtitle={profile?.organizations?.name ?? "Your Agency"}
      />

      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* ── Stat cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          {STAT_CONFIG.map((cfg, i) => {
            const raw = statValues[i]
            const display = cfg.title === "Pipeline Value" ? formatCurrency(raw) : raw
            const pct = raw > 0 ? Math.min(100, Math.round((raw / Math.max(stats.total || 1, 1)) * 100 * (i === 3 ? 1 : 4))) : 0

            return (
              <div
                key={cfg.title}
                className="animate-fade-in-up card-hover relative rounded-2xl bg-white border p-5 overflow-hidden group"
              >
                {/* subtle gradient tint top-right */}
                <div
                  className={`absolute -top-6 -right-6 h-20 w-20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${cfg.gradient} blur-2xl`}
                />

                <div className="relative flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{cfg.title}</p>
                    <p className="text-4xl font-extrabold tracking-tight leading-none">{display}</p>
                  </div>
                  <div
                    className={`h-11 w-11 rounded-2xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shadow-lg shrink-0`}
                    style={{ boxShadow: `0 8px 24px ${cfg.glow}` }}
                  >
                    <cfg.icon className="h-5 w-5 text-white" />
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${cfg.gradient} transition-all duration-1000`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Middle row ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Pipeline funnel */}
          <div
            className="lg:col-span-3 animate-fade-in-up rounded-2xl bg-white border p-6 shadow-sm"
            style={{ animationDelay: "120ms" }}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-bold text-base">Pipeline Funnel</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{allLeads.length} total leads across stages</p>
              </div>
              <Link
                href="/app/pipeline"
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <KanbanSquare className="h-3.5 w-3.5" />
                Open Board
              </Link>
            </div>

            <div className="space-y-3">
              {PIPELINE_STAGES.map((stage) => {
                const count = stageCounts[stage] ?? 0
                const pct = count > 0 ? Math.max(6, Math.round((count / maxCount) * 100)) : 0
                return (
                  <Link href="/app/pipeline" key={stage} className="flex items-center gap-3 group">
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0 transition-transform group-hover:scale-125"
                      style={{ background: STAGE_COLORS[stage] }}
                    />
                    <span className="w-20 text-xs font-medium text-muted-foreground shrink-0 group-hover:text-foreground transition-colors">
                      {STAGE_LABELS[stage]}
                    </span>
                    <div className="flex-1 h-6 rounded-xl bg-muted/60 overflow-hidden">
                      <div
                        className="h-full rounded-xl flex items-center px-3 transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${STAGE_COLORS[stage]}bb, ${STAGE_COLORS[stage]})`,
                        }}
                      >
                        {count > 0 && (
                          <span className="text-[11px] font-bold text-white leading-none">{count}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{count}</span>
                  </Link>
                )
              })}
            </div>

            {/* Won this month badge */}
            {stats.wonThisMonth > 0 && (
              <div className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center shrink-0">
                  <Zap className="h-3.5 w-3.5 text-white" fill="white" />
                </div>
                <p className="text-sm font-semibold text-emerald-800">
                  {stats.wonThisMonth} deal{stats.wonThisMonth > 1 ? "s" : ""} won this month
                  {convRate > 0 && <span className="ml-1 font-normal text-emerald-600">({convRate}% conversion)</span>}
                </p>
              </div>
            )}
          </div>

          {/* Hot leads */}
          <div
            className="lg:col-span-2 animate-fade-in-up rounded-2xl bg-white border overflow-hidden shadow-sm"
            style={{ animationDelay: "180ms" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-base flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-rose-500 to-orange-400 flex items-center justify-center shadow-sm">
                  <Flame className="h-3.5 w-3.5 text-white" />
                </div>
                Hot Leads
              </h2>
              <Link href="/app/leads" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {hotLeads.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-400 flex items-center justify-center mx-auto mb-3 animate-float opacity-70">
                  <Flame className="h-6 w-6 text-white" />
                </div>
                <p className="text-sm font-medium mb-1">No hot leads yet</p>
                <Link href="/app/discover" className="text-xs text-primary hover:underline">
                  Discover channels →
                </Link>
              </div>
            ) : (
              <div className="divide-y stagger-children">
                {hotLeads.map((lead) => {
                  const score = lead.lead_score ?? 0
                  const scoreGradient =
                    score >= 90 ? "from-emerald-500 to-teal-400" :
                    score >= 75 ? "from-indigo-500 to-violet-500" :
                    "from-amber-400 to-orange-400"

                  return (
                    <Link
                      key={lead.id}
                      href={`/app/leads/${lead.id}`}
                      className="animate-fade-in flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors group"
                    >
                      {/* Score bubble */}
                      <div
                        className={`h-9 w-9 rounded-xl bg-gradient-to-br ${scoreGradient} flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform`}
                      >
                        <span className="text-xs font-extrabold text-white leading-none">{score}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                          {lead.channel?.name ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {lead.channel?.niche_primary ?? "Unknown niche"}
                        </p>
                      </div>

                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all shrink-0" />
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Quick actions ─────────────────────────────────────── */}
        <div
          className="animate-fade-in-up grid grid-cols-1 sm:grid-cols-2 gap-4"
          style={{ animationDelay: "240ms" }}
        >
          <Link href="/app/discover" className="card-hover group rounded-2xl border bg-white p-5 flex items-center gap-4 shadow-sm">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform"
              style={{ boxShadow: "0 8px 24px hsl(243 75% 59% / 0.3)" }}>
              <Search className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm group-hover:text-primary transition-colors">Find New Leads</p>
              <p className="text-xs text-muted-foreground mt-0.5">AI-powered YouTube channel discovery</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all shrink-0" />
          </Link>

          <Link href="/app/pipeline" className="card-hover group rounded-2xl border bg-white p-5 flex items-center gap-4 shadow-sm">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform"
              style={{ boxShadow: "0 8px 24px hsl(38 90% 55% / 0.3)" }}>
              <KanbanSquare className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm group-hover:text-primary transition-colors">Manage Pipeline</p>
              <p className="text-xs text-muted-foreground mt-0.5">Drag & drop CRM across 9 stages</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all shrink-0" />
          </Link>
        </div>

        {/* ── Empty state ───────────────────────────────────────── */}
        {allLeads.length === 0 && (
          <div className="animate-fade-in-up rounded-3xl overflow-hidden relative" style={{ animationDelay: "300ms" }}>
            {/* gradient background */}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(135deg, hsl(243 75% 59% / 0.06), hsl(280 75% 60% / 0.10))" }}
            />
            <div className="relative border-2 border-dashed border-primary/20 rounded-3xl p-14 text-center">
              {/* floating blocks decoration */}
              <div className="flex justify-center gap-3 mb-7 select-none">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 animate-block-1 shadow-lg opacity-80" />
                <div className="w-7 h-7 mt-4 rounded-lg bg-gradient-to-br from-rose-500 to-orange-400 animate-block-2 shadow-md opacity-70" />
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 animate-block-3 shadow-lg opacity-80" />
                <div className="w-6 h-6 mt-5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-400 animate-block-4 shadow-md opacity-70" />
              </div>

              <h3 className="text-2xl font-extrabold mb-2">Start finding leads</h3>
              <p className="text-muted-foreground mb-7 max-w-sm mx-auto leading-relaxed">
                Discover YouTube channels in your niche, score them automatically, and fill your pipeline today.
              </p>

              <Link href="/app/discover">
                <button
                  className="btn-glow inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 text-base font-bold text-white transition-all"
                  style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
                >
                  <TrendingUp className="h-5 w-5" />
                  Find Your First Leads
                </button>
              </Link>

              <div className="flex items-center justify-center gap-5 mt-6">
                {["AI scoring", "Faceless detection", "Auto outreach"].map((f) => (
                  <span key={f} className="text-xs text-muted-foreground flex items-center gap-1">
                    <Target className="h-3 w-3 text-primary" /> {f}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
