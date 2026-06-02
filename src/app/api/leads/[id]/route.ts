import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("leads")
      .select("*, channel:channels(*)")
      .eq("id", id)
      .single()

    if (error) return NextResponse.json({ error: "Lead not found" }, { status: 404 })

    // `contacts` has no direct FK to `leads`; fetch by channel_id separately.
    const { data: contact } = await supabase
      .from("contacts")
      .select("*")
      .eq("channel_id", data.channel_id)
      .maybeSingle()

    return NextResponse.json({ ...data, contact: contact ?? null })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to fetch lead" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()

    const body = await req.json()
    const { crm_stage, notes, deal_value_estimate, tags, next_follow_up_at } = body

    const updates: Record<string, unknown> = {}
    if (crm_stage !== undefined) updates.crm_stage = crm_stage
    if (notes !== undefined) updates.notes = notes
    if (deal_value_estimate !== undefined) updates.deal_value_estimate = deal_value_estimate
    if (tags !== undefined) updates.tags = tags
    if (next_follow_up_at !== undefined) updates.next_follow_up_at = next_follow_up_at

    const { data, error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    // Log stage change activity
    if (crm_stage && profile?.org_id) {
      await supabase.from("activities").insert({
        org_id: profile.org_id,
        lead_id: id,
        type: "stage_changed",
        metadata: { to: crm_stage },
      })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 })
  }
}
