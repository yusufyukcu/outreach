import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { refreshAccessToken, fetchThreadReply } from "@/services/gmail"

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 400 })

    const { data: account } = await supabase
      .from("gmail_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()

    if (!account) return NextResponse.json({ error: "Gmail not connected", code: "not_connected" }, { status: 409 })

    // Refresh token if needed
    let accessToken: string = account.access_token
    const expired = !account.expiry || new Date(account.expiry).getTime() - 60_000 < Date.now()
    if (expired || !accessToken) {
      const refreshed = await refreshAccessToken(account.refresh_token)
      accessToken = refreshed.access_token
      const expiry = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("gmail_accounts")
        .update({ access_token: accessToken, expiry, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
    }

    // Fetch email messages that have a thread ID and haven't been marked replied
    const { data: messages } = await supabase
      .from("outreach_messages")
      .select("id, lead_id, gmail_thread_id, gmail_message_id, status")
      .eq("org_id", profile.org_id)
      .eq("channel", "email")
      .not("gmail_thread_id", "is", null)
      .neq("status", "replied")
      .order("created_at", { ascending: false })
      .limit(30)

    if (!messages || messages.length === 0) {
      return NextResponse.json({ checked: 0, found: 0 })
    }

    let found = 0

    for (const msg of messages) {
      try {
        const reply = await fetchThreadReply(
          accessToken,
          msg.gmail_thread_id,
          msg.gmail_message_id ?? "",
          account.email,
        )

        if (!reply) continue

        found++
        const now = new Date().toISOString()

        // Update the outreach message
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("outreach_messages")
          .update({
            status: "replied",
            replied_at: reply.receivedAt,
            reply_from: reply.from,
            reply_body: reply.body,
          })
          .eq("id", msg.id)

        // Advance lead stage to "replied" if it's still "contacted"
        await supabase
          .from("leads")
          .update({ crm_stage: "replied", updated_at: now })
          .eq("id", msg.lead_id)
          .eq("crm_stage", "contacted")

        // Log an activity
        await supabase.from("activities").insert({
          org_id: profile.org_id,
          lead_id: msg.lead_id,
          type: "email_replied",
          metadata: { from: reply.from, preview: reply.body.slice(0, 120) },
        })
      } catch (err) {
        const msg2 = err instanceof Error ? err.message : String(err)
        if (msg2 === "insufficient_scope") {
          return NextResponse.json(
            { error: "Gmail read permission missing. Please reconnect Gmail in Settings.", code: "insufficient_scope" },
            { status: 403 },
          )
        }
        console.error("[sync-replies] thread error:", msg2)
      }
    }

    return NextResponse.json({ checked: messages.length, found })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[sync-replies] error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
