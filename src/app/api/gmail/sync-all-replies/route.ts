import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { refreshAccessToken, fetchThreadReply } from "@/services/gmail"
import { classifyReply, computeResponseHours } from "@/services/intelligence"

// Service-role client — bypasses RLS, safe for server-only cron use.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization") ?? ""
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = adminClient()

  // Get all connected Gmail accounts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accounts } = await (supabase as any)
    .from("gmail_accounts")
    .select("user_id, org_id, email, access_token, refresh_token, expiry")

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ checked: 0, found: 0 })
  }

  let totalChecked = 0
  let totalFound = 0

  for (const account of accounts) {
    try {
      // Refresh token if expired
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
          .eq("user_id", account.user_id)
      }

      // Get pending email messages for this org
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: messages } = await (supabase as any)
        .from("outreach_messages")
        .select("id, lead_id, gmail_thread_id, gmail_message_id, status, sent_at")
        .eq("org_id", account.org_id)
        .eq("channel", "email")
        .not("gmail_thread_id", "is", null)
        .neq("status", "replied")
        .order("created_at", { ascending: false })
        .limit(30)

      if (!messages || messages.length === 0) continue
      totalChecked += messages.length

      for (const msg of messages) {
        try {
          const reply = await fetchThreadReply(
            accessToken,
            msg.gmail_thread_id,
            msg.gmail_message_id ?? "",
            account.email,
          )
          if (!reply) continue

          totalFound++
          const now = new Date().toISOString()

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("outreach_messages")
            .update({
              status:               "replied",
              replied_at:           reply.receivedAt,
              reply_from:           reply.from,
              reply_body:           reply.body,
              reply_classification: classifyReply(reply.body),
              response_time_hours:  computeResponseHours(msg.sent_at ?? null, reply.receivedAt),
            })
            .eq("id", msg.id)

          await supabase
            .from("leads")
            .update({ crm_stage: "replied", updated_at: now })
            .eq("id", msg.lead_id)
            .eq("crm_stage", "contacted")

          await supabase.from("activities").insert({
            org_id: account.org_id,
            lead_id: msg.lead_id,
            type: "email_replied",
            metadata: { from: reply.from, preview: reply.body.slice(0, 120) },
          })
        } catch (err) {
          console.error("[sync-all-replies] message error:", err)
        }
      }
    } catch (err) {
      console.error("[sync-all-replies] account error:", account.email, err)
    }
  }

  console.log(`[sync-all-replies] checked=${totalChecked} found=${totalFound}`)
  return NextResponse.json({ checked: totalChecked, found: totalFound })
}
