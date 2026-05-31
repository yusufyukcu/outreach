import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 400 })

    const { lead_id, channel, subject, body, status = "pending" } = await req.json()

    const { data, error } = await supabase
      .from("outreach_messages")
      .insert({
        org_id: profile.org_id,
        lead_id,
        channel,
        subject,
        body,
        status,
        ai_generated: true,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (error) throw error

    if (status === "sent") {
      await supabase.from("leads").update({ last_contacted_at: new Date().toISOString(), crm_stage: "contacted" }).eq("id", lead_id)
      await supabase.from("activities").insert({
        org_id: profile.org_id,
        lead_id,
        type: "email_sent",
        metadata: { channel, subject },
      })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 })
  }
}
