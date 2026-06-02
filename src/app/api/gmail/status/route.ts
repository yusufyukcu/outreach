import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { gmailConfigured } from "@/services/gmail"

// Report whether the current user has a connected Gmail account.
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ connected: false, configured: gmailConfigured() })

    const { data } = await supabase
      .from("gmail_accounts")
      .select("email")
      .eq("user_id", user.id)
      .maybeSingle()

    return NextResponse.json({
      connected: !!data,
      email: data?.email ?? null,
      configured: gmailConfigured(),
    })
  } catch {
    // Table may not exist yet — treat as not connected.
    return NextResponse.json({ connected: false, configured: gmailConfigured() })
  }
}
