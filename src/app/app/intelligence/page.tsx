import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { BarChart3, TrendingUp, Mail, MessageSquare, Users, Zap, Target, Clock } from "lucide-react"
import { CLASSIFICATION_LABELS, CLASSIFICATION_STYLES, type ReplyClassification } from "@/services/intelligence"

// ─── Data fetching & aggregation ─────────────────────────────────────────────

async function getStats(orgId: string) {
  const supabase = await createClient()

  const [leadsRes, channelsRes, messagesRes, sessionsRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id, channel_id, crm_stage, discovery_keyword, created_at")
      .eq("org_id", orgId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("channels")
      .select("id, niche_primary, subscriber_count"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("outreach_messages")
      .select("id, lead_id, status, reply_classification, response_time_hours, sent_at, replied_at")
      .eq("org_id", orgId)
      .eq("channel", "email")
      .order("created_at", { ascending: false })
      .limit(2000),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("autolead_sessions")
      .select("*")
      .eq("org_id", orgId)
      .order("started_at", { ascending: false })
      .limit(10),
  ])

  const leads = leadsRes.data ?? []
  const channels = channelsRes.data ?? []
  const messages = messagesRes.data ?? []
  const sessions = sessionsRes.data ?? []

  // Lookup maps
  const channelMap: Record<string, { niche_primary: string | null; subscriber_count: number }> =
    Object.fromEntries(channels.map((c: { id: string; niche_primary: string | null; subscriber_count: number }) => [c.id, c]))
  const leadChannelMap: Record<string, string> =
    Object.fromEntries(leads.map((l: { id: string; channel_id: string }) => [l.id, l.channel_id]))

  // ── Overview ────────────────────────────────────────────────────────────────
  const sentMessages = messages.filter((m: { status: string }) => m.status !== "pending")
  const repliedMessages = messages.filter((m: { status: string }) => m.status === "replied")
  const totalLeads = leads.length
  const totalSent = sentMessages.length
  const totalReplied = repliedMessages.length
  const replyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0

  const positiveClasses = new Set(["positive", "interested", "sample_request", "pricing_request", "meeting_request"])
  const positiveCount = repliedMessages.filter(
    (m: { reply_classification: string | null }) => m.reply_classification && positiveClasses.has(m.reply_classification)
  ).length
  const positiveRate = totalReplied > 0 ? (positiveCount / totalReplied) * 100 : 0

  const avgResponseHours = (() => {
    const withTime = repliedMessages.filter((m: { response_time_hours: number | null }) => m.response_time_hours != null)
    if (withTime.length === 0) return null
    const avg = withTime.reduce((sum: number, m: { response_time_hours: number }) => sum + m.response_time_hours, 0) / withTime.length
    return Math.round(avg * 10) / 10
  })()

  // ── Conversion funnel ───────────────────────────────────────────────────────
  const FUNNEL_STAGES = ["new", "analyzed", "contacted", "replied", "lost"] as const
  const stageCounts: Record<string, number> = {}
  for (const l of leads) stageCounts[l.crm_stage] = (stageCounts[l.crm_stage] ?? 0) + 1

  // ── Reply classification ────────────────────────────────────────────────────
  const classificationCounts: Record<string, number> = {}
  for (const m of repliedMessages) {
    const cls = (m.reply_classification as string) ?? "other"
    classificationCounts[cls] = (classificationCounts[cls] ?? 0) + 1
  }
  const sortedClassifications = Object.entries(classificationCounts).sort((a, b) => b[1] - a[1])

  // ── Top keywords ────────────────────────────────────────────────────────────
  const keywordCounts: Record<string, number> = {}
  for (const l of leads) {
    if (l.discovery_keyword) keywordCounts[l.discovery_keyword] = (keywordCounts[l.discovery_keyword] ?? 0) + 1
  }
  const topKeywords = Object.entries(keywordCounts).sort((a, b) => b[1] - a[1]).slice(0, 12)

  // ── Top niches by reply rate ─────────────────────────────────────────────────
  const nicheStats: Record<string, { sent: number; replied: number; leads: number }> = {}
  for (const l of leads) {
    const niche = channelMap[l.channel_id]?.niche_primary ?? "Unknown"
    if (!nicheStats[niche]) nicheStats[niche] = { sent: 0, replied: 0, leads: 0 }
    nicheStats[niche].leads++
  }
  for (const m of sentMessages) {
    const channelId = leadChannelMap[m.lead_id]
    if (!channelId) continue
    const niche = channelMap[channelId]?.niche_primary ?? "Unknown"
    if (!nicheStats[niche]) nicheStats[niche] = { sent: 0, replied: 0, leads: 0 }
    nicheStats[niche].sent++
    if (m.status === "replied") nicheStats[niche].replied++
  }
  const topNiches = Object.entries(nicheStats)
    .filter(([, s]) => s.sent >= 2)
    .map(([niche, s]) => ({ niche, ...s, rate: s.sent > 0 ? (s.replied / s.sent) * 100 : 0 }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8)

  // ── Subscriber range analysis ────────────────────────────────────────────────
  const SUB_RANGES = [
    { label: "1K–10K",    min: 1_000,     max: 10_000 },
    { label: "10K–100K",  min: 10_000,    max: 100_000 },
    { label: "100K–1M",   min: 100_000,   max: 1_000_000 },
    { label: "1M+",       min: 1_000_000, max: Infinity },
  ]
  const rangeStats = SUB_RANGES.map((range) => {
    const rangeLeadIds = new Set(
      leads
        .filter((l: { channel_id: string }) => {
          const subs = channelMap[l.channel_id]?.subscriber_count ?? 0
          return subs >= range.min && subs < range.max
        })
        .map((l: { id: string }) => l.id)
    )
    const rangeMsgs = sentMessages.filter((m: { lead_id: string }) => rangeLeadIds.has(m.lead_id))
    const sent = rangeMsgs.length
    const replied = rangeMsgs.filter((m: { status: string }) => m.status === "replied").length
    return { ...range, leads: rangeLeadIds.size, sent, replied, rate: sent > 0 ? (replied / sent) * 100 : 0 }
  })

  return {
    overview: { totalLeads, totalSent, totalReplied, replyRate, positiveCount, positiveRate, avgResponseHours },
    stageCounts,
    classificationCounts: sortedClassifications,
    topKeywords,
    topNiches,
    rangeStats,
    sessions,
    hasData: totalLeads > 0 || totalSent > 0,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals).replace(/\.0$/, "")
}

function fmtSubs(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function IntelligencePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
  if (!profile?.org_id) redirect("/auth/login")

  const stats = await getStats(profile.org_id)

  const STAGE_LABELS: Record<string, string> = {
    new: "New", analyzed: "Analyzed", contacted: "Contacted",
    replied: "Replied", lost: "Lost",
  }
  const FUNNEL_STAGES = ["new", "analyzed", "contacted", "replied", "lost"]
  const maxStageCount = Math.max(1, ...FUNNEL_STAGES.map((s) => stats.stageCounts[s] ?? 0))

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "var(--sl-bg-0)" }}>
      <div className="max-w-6xl mx-auto w-full p-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))" }}>
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-foreground">Data Intelligence</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Data collection phase — no optimizations active. Run AutoLead to populate this dashboard.
            </p>
          </div>
        </div>

        {/* Empty-state notice */}
        {!stats.hasData && (
          <div className="rounded-2xl p-5" style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)" }}>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-300">No data yet</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Start AutoLead to begin collecting lead discovery, outreach, and reply data. This dashboard updates automatically.
            </p>
          </div>
        )}

        {/* ── Overview cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Leads Discovered", value: stats.overview.totalLeads.toLocaleString(), icon: Users, grad: "hsl(243 75% 55%), hsl(280 80% 58%)" },
            { label: "Emails Sent", value: stats.overview.totalSent.toLocaleString(), icon: Mail, grad: "hsl(199 80% 45%), hsl(180 75% 40%)" },
            { label: "Replies", value: stats.overview.totalReplied.toLocaleString(), icon: MessageSquare, grad: "hsl(150 60% 40%), hsl(170 70% 35%)" },
            { label: "Reply Rate", value: `${fmt(stats.overview.replyRate)}%`, icon: TrendingUp, grad: "hsl(150 60% 40%), hsl(170 70% 35%)" },
            { label: "Positive Rate", value: `${fmt(stats.overview.positiveRate)}%`, icon: Target, grad: "hsl(40 90% 55%), hsl(35 90% 50%)" },
            {
              label: "Avg Response",
              value: stats.overview.avgResponseHours != null
                ? stats.overview.avgResponseHours >= 24
                  ? `${fmt(stats.overview.avgResponseHours / 24)}d`
                  : `${fmt(stats.overview.avgResponseHours)}h`
                : "—",
              icon: Clock,
              grad: "hsl(270 70% 60%), hsl(280 75% 55%)",
            },
          ].map(({ label, value, icon: Icon, grad }) => (
            <div key={label} className="rounded-2xl p-4" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${grad.split(",")[0].trim().replace("hsl(", "").replace(")", "")})` }} />
                <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
              </div>
              <p className="text-2xl font-extrabold tabular-nums bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(135deg, ${grad})` }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Conversion Funnel ──────────────────────────────────────────── */}
          <div className="rounded-2xl p-5" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
            <h2 className="text-sm font-bold text-foreground mb-4">Conversion Funnel</h2>
            <div className="space-y-2.5">
              {FUNNEL_STAGES.map((stage, i) => {
                const count = stats.stageCounts[stage] ?? 0
                const pct = maxStageCount > 0 ? (count / maxStageCount) * 100 : 0
                const colors = [
                  "hsl(243 75% 68%)", "hsl(199 80% 55%)", "hsl(160 60% 50%)",
                  "hsl(150 60% 45%)", "hsl(40 90% 55%)", "hsl(270 70% 60%)",
                  "hsl(280 75% 65%)", "hsl(150 70% 45%)",
                ]
                return (
                  <div key={stage}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{STAGE_LABELS[stage]}</span>
                      <span className="text-xs font-bold tabular-nums" style={{ color: colors[i] }}>{count.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${colors[i]}, ${colors[i]}88)` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            {stats.stageCounts["lost"] > 0 && (
              <p className="text-[11px] text-muted-foreground/50 mt-3">
                + {stats.stageCounts["lost"]} lost
              </p>
            )}
          </div>

          {/* ── Reply Classification ────────────────────────────────────────── */}
          <div className="rounded-2xl p-5" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
            <h2 className="text-sm font-bold text-foreground mb-4">Reply Classification</h2>
            {stats.classificationCounts.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 py-4 text-center">No replies classified yet</p>
            ) : (
              <div className="space-y-2">
                {stats.classificationCounts.map(([cls, count]) => {
                  const label = CLASSIFICATION_LABELS[cls as ReplyClassification] ?? cls
                  const style = CLASSIFICATION_STYLES[cls as ReplyClassification] ?? CLASSIFICATION_STYLES.other
                  const pct = stats.overview.totalReplied > 0 ? Math.round((count / stats.overview.totalReplied) * 100) : 0
                  return (
                    <div key={cls} className="flex items-center gap-3">
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={style}>
                        {label}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: (style.border as string)?.replace("1px solid ", "") ?? "rgba(255,255,255,0.3)" }} />
                      </div>
                      <span className="text-xs font-bold tabular-nums text-foreground/70 w-6 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Top Niches ─────────────────────────────────────────────────── */}
          <div className="rounded-2xl p-5" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
            <h2 className="text-sm font-bold text-foreground mb-4">Top Niches by Reply Rate</h2>
            {stats.topNiches.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 py-4 text-center">Send at least 2 emails per niche to see data</p>
            ) : (
              <div className="space-y-3">
                {stats.topNiches.map(({ niche, leads, sent, replied, rate }) => {
                  const maxRate = stats.topNiches[0]?.rate ?? 1
                  return (
                    <div key={niche}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-foreground/80 font-medium truncate max-w-[140px]">{niche}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-muted-foreground">{leads} leads · {sent} sent · {replied} replied</span>
                          <span className="text-xs font-bold" style={{ color: rate >= 15 ? "#34d399" : rate >= 8 ? "#fbbf24" : "#f87171" }}>
                            {fmt(rate)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${(rate / maxRate) * 100}%`, background: rate >= 15 ? "#34d399" : rate >= 8 ? "#fbbf24" : "#f87171" }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Top Discovery Keywords ─────────────────────────────────────── */}
          <div className="rounded-2xl p-5" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
            <h2 className="text-sm font-bold text-foreground mb-4">Top Discovery Keywords</h2>
            {stats.topKeywords.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 py-4 text-center">No keyword data yet — requires AutoLead runs</p>
            ) : (
              <div className="space-y-1.5">
                {stats.topKeywords.map(([keyword, count], i) => {
                  const maxCount = stats.topKeywords[0]?.[1] ?? 1
                  return (
                    <div key={keyword} className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground/50 w-4 tabular-nums text-right shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-foreground/80 truncate">&ldquo;{keyword}&rdquo;</span>
                          <span className="text-xs font-bold text-foreground/60 tabular-nums shrink-0 ml-2">{count}</span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <div className="h-full rounded-full" style={{ width: `${(count / maxCount) * 100}%`, background: "hsl(243 75% 60%)" }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Subscriber Range Analysis ──────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <h2 className="text-sm font-bold text-foreground">Subscriber Range Analysis</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  {["Range", "Leads", "Emails Sent", "Replies", "Reply Rate"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 font-semibold text-muted-foreground/80">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.rangeStats.map(({ label, leads, sent, replied, rate }) => (
                  <tr key={label} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className="px-5 py-3 font-medium text-foreground">{label}</td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">{leads.toLocaleString()}</td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">{sent.toLocaleString()}</td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">{replied.toLocaleString()}</td>
                    <td className="px-5 py-3">
                      {sent === 0 ? (
                        <span className="text-muted-foreground/30">—</span>
                      ) : (
                        <span className="font-bold tabular-nums"
                          style={{ color: rate >= 15 ? "#34d399" : rate >= 8 ? "#fbbf24" : rate > 0 ? "#f87171" : "hsl(220 9% 50%)" }}>
                          {fmt(rate)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Recent AutoLead Sessions ───────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <h2 className="text-sm font-bold text-foreground">Recent AutoLead Sessions</h2>
          </div>
          {stats.sessions.length === 0 ? (
            <p className="px-5 py-6 text-xs text-muted-foreground/50 text-center">No sessions recorded yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                    {["Started", "Duration", "Niche", "Config", "Leads", "Emails"].map((h) => (
                      <th key={h} className="text-left px-5 py-3 font-semibold text-muted-foreground/80">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.sessions.map((s: {
                    id: string; started_at: string; ended_at: string | null;
                    niche: string | null; faceless_mode: boolean; auto_send: boolean;
                    min_subs: number | null; max_subs: number | null;
                    leads_found: number; emails_sent: number;
                  }) => {
                    const start = new Date(s.started_at)
                    const duration = s.ended_at
                      ? (() => {
                          const ms = new Date(s.ended_at).getTime() - start.getTime()
                          const m = Math.floor(ms / 60_000)
                          const h = Math.floor(m / 60)
                          return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
                        })()
                      : "Running"
                    const config = [
                      s.faceless_mode && "Faceless",
                      s.auto_send && "Auto Send",
                      s.min_subs && s.max_subs ? `${fmtSubs(s.min_subs)}–${fmtSubs(s.max_subs)}` : null,
                    ].filter(Boolean).join(" · ") || "Default"
                    return (
                      <tr key={s.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td className="px-5 py-3 text-muted-foreground">
                          {start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}{" "}
                          <span className="opacity-50">{start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </td>
                        <td className="px-5 py-3 tabular-nums" style={{ color: s.ended_at ? "var(--sl-fg-3)" : "#34d399" }}>
                          {duration}
                        </td>
                        <td className="px-5 py-3 text-foreground/80">{s.niche ?? "Any"}</td>
                        <td className="px-5 py-3 text-muted-foreground">{config}</td>
                        <td className="px-5 py-3 font-bold text-foreground tabular-nums">{s.leads_found}</td>
                        <td className="px-5 py-3 font-bold text-foreground tabular-nums">{s.emails_sent}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
