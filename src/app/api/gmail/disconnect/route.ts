import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Remove the user's stored Gmail tokens.
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // RLS restricts deletion to the user's own row.
    const { error } = await supabase.from("gmail_accounts").delete().eq("user_id", user.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Gmail disconnect error:", err)
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 })
  }
}
