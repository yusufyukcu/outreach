import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// POST — create a new AutoLead session at run start
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single()
  if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 400 })

  const { niche, faceless_mode, min_subs, max_subs, auto_send } = await req.json()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("autolead_sessions")
    .insert({
      org_id:       profile.org_id,
      niche:        niche ?? null,
      faceless_mode: faceless_mode ?? false,
      min_subs:     min_subs ?? null,
      max_subs:     max_subs ?? null,
      auto_send:    auto_send ?? false,
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}

// PATCH — close the session and record final stats
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, leads_found, emails_sent } = await req.json()
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("autolead_sessions")
    .update({
      ended_at:    new Date().toISOString(),
      leads_found: leads_found ?? 0,
      emails_sent: emails_sent ?? 0,
    })
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
