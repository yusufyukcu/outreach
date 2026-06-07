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
  new: "New", analyzed: "Analyzed", contacted: "Contacted",
  replied: "Replied", lost: "Lost",
}

const STAGE_COLORS: Record<CRMStage, string> = {
  new: "#94a3b8", analyzed: "#60a5fa", contacted: "#fbbf24",
  replied: "#a78bfa", lost: "#f87171",
}

const STAT_CONFIG = [
  { title: "Total Leads",      icon: Users,      gradient: "linear-gradient(135deg, hsl(243 75% 62%), hsl(280 75% 62%))",  glow: "hsl(243 75% 59% / 0.35)" },
  { title: "Hot Leads",        icon: Flame,      gradient: "linear-gradient(135deg, hsl(0 84% 60%), hsl(25 95% 58%))",     glow: "hsl(0 84% 60% / 0.35)" },
  { title: "Contacted / Week", icon: Mail,       gradient: "linear-gradient(135deg, hsl(213 90% 60%), hsl(189 90% 50%))",  glow: "hsl(213 90% 60% / 0.35)" },
  { title: "Pipeline Value",   icon: DollarSign, gradient: "linear-gradient(135deg, hsl(158 64% 52%), hsl(172 66% 50%))",  glow: "hsl(158 64% 52% / 0.35)" },
]

const PIPELINE_STAGES: CRMStage[] = ["new", "analyzed", "contacted", "replied", "lost"]

const CARD_STYLE = {
  background: "#0d1117",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20,
  boxShadow: "0 4px 16px hsl(225 40% 2% / 0.45)",
}

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
    repliedThisMonth:   allLeads.filter(l => l.crm_stage === "replied" && new Date(l.updated_at) > monthAgo).length,
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

  const convRate = stats.total > 0 ? Math.round((stats.repliedThisMonth / stats.total) * 100) : 0

  return (
    <div className="flex flex-col overflow-auto sl-scroll-area" style={{ color: "var(--sl-fg-1)" }}>
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
                className="animate-fade-in-up relative overflow-hidden group"
                style={{ ...CARD_STYLE, padding: "20px" }}
              >
                {/* subtle glow on hover */}
                <div
                  className="absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl"
                  style={{ background: cfg.gradient }}
                />

                <div className="relative flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--sl-fg-3)" }}>{cfg.title}</p>
                    <p className="text-4xl font-extrabold tracking-tight leading-none" style={{ color: "var(--sl-fg-1)" }}>{display}</p>
                  </div>
                  <div
                    className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: cfg.gradient, boxShadow: `0 8px 24px ${cfg.glow}` }}
                  >
                    <cfg.icon className="h-5 w-5 text-white" />
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${pct}%`, background: cfg.gradient }}
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
            className="lg:col-span-3 animate-fade-in-up p-6"
            style={{ ...CARD_STYLE, animationDelay: "120ms" }}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-bold text-base" style={{ color: "var(--sl-fg-1)" }}>Pipeline Funnel</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--sl-fg-3)" }}>{allLeads.length} total leads across stages</p>
              </div>
              <Link
                href="/app/pipeline"
                className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
                style={{ color: "hsl(243 75% 68%)" }}
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
                    <span className="w-20 text-xs font-medium shrink-0 transition-colors" style={{ color: "var(--sl-fg-3)" }}>
                      {STAGE_LABELS[stage]}
                    </span>
                    <div className="flex-1 h-6 rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
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
                    <span className="text-xs w-6 text-right shrink-0" style={{ color: "var(--sl-fg-3)" }}>{count}</span>
                  </Link>
                )
              })}
            </div>

            {/* Replied this month badge */}
            {stats.repliedThisMonth > 0 && (
              <div className="mt-5 flex items-center gap-2 rounded-xl px-4 py-2.5" style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)" }}>
                <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))" }}>
                  <Zap className="h-3.5 w-3.5 text-white" fill="white" />
                </div>
                <p className="text-sm font-semibold" style={{ color: "#a78bfa" }}>
                  {stats.repliedThisMonth} repl{stats.repliedThisMonth > 1 ? "ies" : "y"} this month
                  {convRate > 0 && <span className="ml-1 font-normal" style={{ color: "rgba(167,139,250,0.75)" }}>({convRate}% reply rate)</span>}
                </p>
              </div>
            )}
          </div>

          {/* Hot leads */}
          <div
            className="lg:col-span-2 animate-fade-in-up overflow-hidden"
            style={{ ...CARD_STYLE, animationDelay: "180ms", padding: 0 }}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h2 className="font-bold text-base flex items-center gap-2" style={{ color: "var(--sl-fg-1)" }}>
                <div className="h-7 w-7 rounded-lg flex items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, hsl(0 84% 60%), hsl(25 95% 58%))" }}>
                  <Flame className="h-3.5 w-3.5 text-white" />
                </div>
                Hot Leads
              </h2>
              <Link href="/app/leads" className="text-xs font-semibold flex items-center gap-1 transition-colors" style={{ color: "hsl(243 75% 68%)" }}>
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {hotLeads.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto mb-3 animate-float opacity-70" style={{ background: "linear-gradient(135deg, hsl(0 84% 60%), hsl(25 95% 58%))" }}>
                  <Flame className="h-6 w-6 text-white" />
                </div>
                <p className="text-sm font-medium mb-1" style={{ color: "var(--sl-fg-2)" }}>No hot leads yet</p>
                <Link href="/app/discover" className="text-xs transition-colors" style={{ color: "hsl(243 75% 68%)" }}>
                  Discover channels →
                </Link>
              </div>
            ) : (
              <div className="stagger-children">
                {hotLeads.map((lead) => {
                  const score = lead.lead_score ?? 0
                  const scoreGrad =
                    score >= 90 ? "linear-gradient(135deg, hsl(158 64% 52%), hsl(172 66% 50%))" :
                    score >= 75 ? "linear-gradient(135deg, hsl(243 75% 62%), hsl(280 75% 62%))" :
                    "linear-gradient(135deg, hsl(43 96% 56%), hsl(25 95% 58%))"

                  return (
                    <Link
                      key={lead.id}
                      href={`/app/leads/${lead.id}`}
                      className="animate-fade-in flex items-center gap-3 px-5 py-3.5 transition-colors group hover:bg-white/[0.03]"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      {/* Score bubble */}
                      <div
                        className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform"
                        style={{ background: scoreGrad }}
                      >
                        <span className="text-xs font-extrabold text-white leading-none">{score}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate transition-colors" style={{ color: "var(--sl-fg-1)" }}>
                          {lead.channel?.name ?? "—"}
                        </p>
                        <p className="text-xs truncate" style={{ color: "var(--sl-fg-3)" }}>
                          {lead.channel?.niche_primary ?? "Unknown niche"}
                        </p>
                      </div>

                      <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" style={{ color: "var(--sl-fg-3)" }} />
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
          <Link
            href="/app/discover"
            className="group flex items-center gap-4 p-5 transition-all duration-200 hover:bg-[#101520]"
            style={{ ...CARD_STYLE }}
          >
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
              style={{ background: "linear-gradient(135deg, hsl(243 75% 62%), hsl(280 75% 62%))", boxShadow: "0 8px 24px hsl(243 75% 59% / 0.3)" }}>
              <Search className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm" style={{ color: "var(--sl-fg-1)" }}>Find New Leads</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--sl-fg-3)" }}>AI-powered YouTube channel discovery</p>
            </div>
            <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" style={{ color: "var(--sl-fg-3)" }} />
          </Link>

          <Link
            href="/app/pipeline"
            className="group flex items-center gap-4 p-5 transition-all duration-200 hover:bg-[#101520]"
            style={{ ...CARD_STYLE }}
          >
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
              style={{ background: "linear-gradient(135deg, hsl(43 96% 56%), hsl(25 95% 58%))", boxShadow: "0 8px 24px hsl(38 90% 55% / 0.3)" }}>
              <KanbanSquare className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm" style={{ color: "var(--sl-fg-1)" }}>Manage Pipeline</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--sl-fg-3)" }}>Drag & drop CRM across 9 stages</p>
            </div>
            <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" style={{ color: "var(--sl-fg-3)" }} />
          </Link>
        </div>

        {/* ── Empty state ───────────────────────────────────────── */}
        {allLeads.length === 0 && (
          <div className="animate-fade-in-up rounded-3xl overflow-hidden relative" style={{ animationDelay: "300ms" }}>
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(135deg, hsl(243 75% 59% / 0.08), hsl(280 75% 60% / 0.12))" }}
            />
            <div className="relative rounded-3xl p-14 text-center" style={{ border: "2px dashed rgba(99,102,241,0.25)" }}>
              {/* floating blocks decoration */}
              <div className="flex justify-center gap-3 mb-7 select-none">
                <div className="w-10 h-10 rounded-xl animate-block-1 shadow-lg opacity-80" style={{ background: "linear-gradient(135deg, hsl(243 75% 62%), hsl(280 75% 62%))" }} />
                <div className="w-7 h-7 mt-4 rounded-lg animate-block-2 shadow-md opacity-70" style={{ background: "linear-gradient(135deg, hsl(0 84% 60%), hsl(25 95% 58%))" }} />
                <div className="w-10 h-10 rounded-xl animate-block-3 shadow-lg opacity-80" style={{ background: "linear-gradient(135deg, hsl(213 90% 60%), hsl(189 90% 50%))" }} />
                <div className="w-6 h-6 mt-5 rounded-lg animate-block-4 shadow-md opacity-70" style={{ background: "linear-gradient(135deg, hsl(158 64% 52%), hsl(172 66% 50%))" }} />
              </div>

              <h3 className="text-2xl font-extrabold mb-2" style={{ color: "var(--sl-fg-1)" }}>Start finding leads</h3>
              <p className="mb-7 max-w-sm mx-auto leading-relaxed text-sm" style={{ color: "var(--sl-fg-3)" }}>
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
                  <span key={f} className="text-xs flex items-center gap-1" style={{ color: "var(--sl-fg-3)" }}>
                    <Target className="h-3 w-3" style={{ color: "hsl(243 75% 68%)" }} /> {f}
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
