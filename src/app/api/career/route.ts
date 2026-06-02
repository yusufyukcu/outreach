import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// List the org's work experiences (newest first).
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json([])

    const { data, error } = await supabase
      .from("work_experiences")
      .select("*")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })

    // Table may not exist yet (migration not run) — degrade gracefully.
    if (error) return NextResponse.json([])
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error("Career GET error:", err)
    return NextResponse.json([])
  }
}

// Add a work experience.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 400 })

    const body = await req.json()
    const channel_name = (body.channel_name ?? "").trim()
    if (!channel_name) return NextResponse.json({ error: "Channel name is required" }, { status: 400 })

    const { data, error } = await supabase
      .from("work_experiences")
      .insert({
        org_id: profile.org_id,
        user_id: user.id,
        channel_name,
        role: (body.role ?? "").trim() || null,
        result: (body.result ?? "").trim() || null,
        channel_url: (body.channel_url ?? "").trim() || null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error("Career POST error:", err)
    return NextResponse.json({ error: "Failed to save experience" }, { status: 500 })
  }
}

// Delete a work experience by id (?id=...).
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    // RLS ensures users can only delete rows in their own org.
    const { error } = await supabase.from("work_experiences").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Career DELETE error:", err)
    return NextResponse.json({ error: "Failed to delete experience" }, { status: 500 })
  }
}
