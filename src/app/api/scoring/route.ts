import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { scoreChannel } from "@/services/scoring"
import type { ServiceType } from "@/types"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, organizations(service_type)")
      .eq("id", user.id)
      .single() as { data: { org_id: string; organizations: { service_type: ServiceType } } | null }

    if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 400 })

    const { channel_id, lead_id } = await req.json()
    const serviceType: ServiceType = profile.organizations?.service_type ?? "editing"

    const { data: channel, error: chErr } = await supabase
      .from("channels")
      .select("*")
      .eq("id", channel_id)
      .single()

    if (chErr || !channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 })

    const breakdown = scoreChannel(channel, serviceType)

    // Update lead score
    await supabase
      .from("leads")
      .update({ lead_score: breakdown.total, score_breakdown: breakdown })
      .eq("id", lead_id)

    await supabase.from("activities").insert({
      org_id: profile.org_id,
      lead_id,
      type: "score_updated",
      metadata: { score: breakdown.total, breakdown },
    })

    return NextResponse.json(breakdown)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Scoring failed" }, { status: 500 })
  }
}
