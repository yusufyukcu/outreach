import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { CRMStage } from "@/types"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 400 })

    const { searchParams } = new URL(req.url)
    const stage = searchParams.get("stage") as CRMStage | null
    const minScore = searchParams.get("min_score")

    // `contacts` has no direct FK to `leads` (both reference `channels`), so we
    // embed only the leads→channels relationship and merge contacts separately.
    let query = supabase
      .from("leads")
      .select("*, channel:channels(*)")
      .eq("org_id", profile.org_id)
      .order("lead_score", { ascending: false, nullsFirst: false })

    if (stage) query = query.eq("crm_stage", stage)
    if (minScore) query = query.gte("lead_score", parseInt(minScore))

    const { data, error } = await query
    if (error) throw error

    const leadRows = data ?? []
    const channelIds = [...new Set(leadRows.map((l) => l.channel_id).filter(Boolean))]
    let contactsByChannel: Record<string, unknown> = {}
    if (channelIds.length > 0) {
      const { data: contacts } = await supabase.from("contacts").select("*").in("channel_id", channelIds)
      contactsByChannel = Object.fromEntries((contacts ?? []).map((c) => [c.channel_id, c]))
    }
    const merged = leadRows.map((l) => ({ ...l, contact: contactsByChannel[l.channel_id] ?? null }))

    return NextResponse.json(merged)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 400 })

    const { channel_id, score, score_breakdown, source } = await req.json()

    // Check for existing
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("channel_id", channel_id)
      .single()

    if (existing) return NextResponse.json({ id: existing.id, already_exists: true })

    const { data, error } = await supabase
      .from("leads")
      .insert({
        org_id: profile.org_id,
        channel_id,
        crm_stage: "new",
        lead_score: score ?? null,
        score_breakdown: score_breakdown ?? null,
        source: source ?? "discovery",
      })
      .select()
      .single()

    if (error) throw error

    // Log activity
    await supabase.from("activities").insert({
      org_id: profile.org_id,
      lead_id: data.id,
      type: "lead_created",
      metadata: {},
    })

    revalidatePath("/app/leads")
    revalidatePath("/app/dashboard")

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 })
  }
}
