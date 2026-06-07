import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/layout/header"
import { SyncRepliesButton } from "@/components/outreach/sync-replies-button"
import { Mail, MailOpen, MessageSquare, TrendingUp, Reply } from "lucide-react"
import { timeAgo } from "@/lib/utils"
import Link from "next/link"
import type { OutreachMessage } from "@/types"

export default async function OutreachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
  const orgId = profile?.org_id
  if (!orgId) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: messages } = await (supabase as any)
    .from("outreach_messages")
    .select("*, lead:leads(id, channel:channels(name, thumbnail_url))")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50)

  const allMessages = (messages ?? []) as (OutreachMessage & { lead: { id: string; channel: { name: string; thumbnail_url?: string } } | null })[]

  const stats = {
    total: allMessages.length,
    sent: allMessages.filter(m => ["sent", "delivered", "opened", "replied"].includes(m.status)).length,
    opened: allMessages.filter(m => ["opened", "replied"].includes(m.status)).length,
    replied: allMessages.filter(m => m.status === "replied").length,
  }

  const openRate = stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0
  const replyRate = stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0

  const statCards = [
    { label: "Total Sent", value: stats.sent, icon: Mail, from: "from-blue-500", to: "to-cyan-400", barVal: stats.sent },
    { label: "Opened", value: stats.opened, icon: MailOpen, from: "from-violet-500", to: "to-purple-400", barVal: stats.opened },
    { label: "Replied", value: stats.replied, icon: MessageSquare, from: "from-emerald-500", to: "to-teal-400", barVal: stats.replied },
    { label: "Reply Rate", value: `${replyRate}%`, icon: TrendingUp, from: "from-rose-500", to: "to-orange-400", barVal: replyRate },
  ]

  function statusPillStyle(status: string): React.CSSProperties {
    if (status === "sent" || status === "delivered") return { background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" }
    if (status === "opened") return { background: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)" }
    if (status === "replied") return { background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }
    return { background: "rgba(255,255,255,0.06)", color: "var(--sl-fg-3)", border: "1px solid rgba(255,255,255,0.08)" }
  }

  return (
    <div className="flex flex-col overflow-auto">
      <Header title="Outreach" subtitle="Track your outreach messages and performance" />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up stagger-children">
          {statCards.map(stat => (
            <div key={stat.label} className="rounded-2xl p-5" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-start gap-3 mb-3">
                <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${stat.from} ${stat.to} flex items-center justify-center shrink-0 shadow-sm`}>
                  <stat.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none mt-0.5">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${stat.from} ${stat.to} transition-all duration-700`}
                  style={{ width: `${Math.min(100, stats.sent > 0 ? (stat.barVal / (stat.label === "Reply Rate" ? 100 : Math.max(stats.sent, 1))) * 100 : 0)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Message list */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-sm">Recent Messages</h3>
              {openRate > 0 && (
                <span className="text-xs text-muted-foreground">{openRate}% open rate</span>
              )}
            </div>
            <SyncRepliesButton />
          </div>
          {allMessages.length === 0 ? (
            <div className="py-16 text-center">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center mx-auto mb-4 shadow-lg opacity-80">
                <Mail className="h-8 w-8 text-white" />
              </div>
              <p className="font-semibold text-base mb-1">No messages yet</p>
              <p className="text-sm text-muted-foreground">Generate outreach from a lead&apos;s detail page</p>
            </div>
          ) : (
            <div className="divide-y">
              {allMessages.map(msg => {
                const lead = msg.lead
                const hasReply = msg.status === "replied" && msg.reply_body
                return (
                  <div key={msg.id} className="group">
                    {/* Sent message row */}
                    <Link
                      href={lead?.id ? `/app/leads/${lead.id}` : "#"}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium truncate">{lead?.channel?.name ?? "Unknown"}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={statusPillStyle(msg.channel)}>{msg.channel}</span>
                        </div>
                        {msg.subject && <p className="text-xs text-muted-foreground truncate">{msg.subject}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={statusPillStyle(msg.status)}>
                          {msg.status}
                        </span>
                        <span className="text-xs text-muted-foreground">{timeAgo(msg.created_at)}</span>
                      </div>
                    </Link>

                    {/* Reply thread (Gmail-style) */}
                    {hasReply && (
                      <div className="mx-5 mb-3 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(52,211,153,0.2)", background: "rgba(52,211,153,0.06)" }}>
                        {/* Reply header */}
                        <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid rgba(52,211,153,0.15)", background: "rgba(52,211,153,0.08)" }}>
                          <Reply className="h-3.5 w-3.5 shrink-0" style={{ color: "#34d399" }} />
                          <span className="text-xs font-semibold truncate" style={{ color: "#34d399" }}>{msg.reply_from}</span>
                          {msg.replied_at && (
                            <span className="ml-auto text-xs shrink-0" style={{ color: "#6ee7b7" }}>{timeAgo(msg.replied_at)}</span>
                          )}
                        </div>
                        {/* Reply body */}
                        <p className="px-4 py-3 text-xs whitespace-pre-wrap line-clamp-4" style={{ color: "#a7f3d0" }}>
                          {msg.reply_body}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
