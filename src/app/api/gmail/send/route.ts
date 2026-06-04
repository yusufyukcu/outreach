import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { refreshAccessToken, sendGmailMessage } from "@/services/gmail"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 400 })

    const { to, subject, body, lead_id } = await req.json()
    if (!to || !body) return NextResponse.json({ error: "Missing recipient or body" }, { status: 400 })

    // Load the user's connected Gmail account.
    const { data: account } = await supabase
      .from("gmail_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()

    if (!account) {
      return NextResponse.json({ error: "Gmail not connected", code: "not_connected" }, { status: 409 })
    }

    // Refresh the access token if it's missing or about to expire (60s buffer).
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

    await sendGmailMessage(accessToken, { from: account.email, to, subject: subject ?? "", body })

    // Log the message and advance the lead, mirroring the "mark as sent" flow.
    if (lead_id) {
      await supabase.from("outreach_messages").insert({
        org_id: profile.org_id,
        lead_id,
        channel: "email",
        subject: subject ?? null,
        body,
        status: "sent",
        ai_generated: true,
        sent_at: new Date().toISOString(),
      })
      await supabase
        .from("leads")
        .update({ last_contacted_at: new Date().toISOString(), crm_stage: "contacted" })
        .eq("id", lead_id)
      await supabase.from("activities").insert({
        org_id: profile.org_id,
        lead_id,
        type: "email_sent",
        metadata: { channel: "email", subject, to },
      })
    }

    return NextResponse.json({ ok: true, sent_from: account.email })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("Gmail send error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
