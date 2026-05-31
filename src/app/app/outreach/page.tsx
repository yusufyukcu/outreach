import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/layout/header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Mail, MailOpen, MessageSquare, TrendingUp } from "lucide-react"
import { timeAgo } from "@/lib/utils"
import Link from "next/link"

export default async function OutreachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
  const orgId = profile?.org_id
  if (!orgId) return null

  const { data: messages } = await supabase
    .from("outreach_messages")
    .select("*, lead:leads(id, channel:channels(name, thumbnail_url))")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50)

  const allMessages = messages ?? []
  const stats = {
    total: allMessages.length,
    sent: allMessages.filter(m => ["sent", "delivered", "opened", "replied"].includes(m.status)).length,
    opened: allMessages.filter(m => ["opened", "replied"].includes(m.status)).length,
    replied: allMessages.filter(m => m.status === "replied").length,
  }

  const openRate = stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0
  const replyRate = stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0

  return (
    <div className="flex flex-col overflow-auto">
      <Header title="Outreach" subtitle="Track your outreach messages and performance" />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Sent", value: stats.sent, icon: Mail, color: "text-blue-600 bg-blue-50" },
            { label: "Opened", value: stats.opened, icon: MailOpen, color: "text-purple-600 bg-purple-50" },
            { label: "Replied", value: stats.replied, icon: MessageSquare, color: "text-emerald-600 bg-emerald-50" },
            { label: "Reply Rate", value: `${replyRate}%`, icon: TrendingUp, color: "text-orange-600 bg-orange-50" },
          ].map(stat => (
            <Card key={stat.label}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center ${stat.color}`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Message list */}
        <Card>
          <div className="border-b px-4 py-3 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Recent Messages</h3>
            {openRate > 0 && (
              <span className="text-xs text-muted-foreground">{openRate}% open rate</span>
            )}
          </div>
          {allMessages.length === 0 ? (
            <CardContent className="py-12 text-center text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No messages yet</p>
              <p className="text-sm">Generate outreach from a lead&apos;s detail page</p>
            </CardContent>
          ) : (
            <div>
              {allMessages.map(msg => {
                const lead = msg.lead as { id: string; channel: { name: string; thumbnail_url?: string } } | null
                return (
                  <Link
                    key={msg.id}
                    href={lead?.id ? `/app/leads/${lead.id}` : "#"}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors border-b last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{lead?.channel?.name ?? "Unknown"}</p>
                        <Badge variant="secondary" className="text-xs">{msg.channel}</Badge>
                      </div>
                      {msg.subject && <p className="text-xs text-muted-foreground truncate">{msg.subject}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={msg.status === "replied" ? "success" : msg.status === "opened" ? "info" : "secondary"}
                        className="text-xs"
                      >
                        {msg.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{timeAgo(msg.created_at)}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
