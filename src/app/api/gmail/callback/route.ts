import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exchangeCodeForTokens, emailFromIdToken } from "@/services/gmail"

// Google redirects here with ?code & ?state. Exchange the code for tokens and
// persist them so we can send mail on the user's behalf.
export async function GET(req: NextRequest) {
  const settingsUrl = (status: string) =>
    new URL(`/app/settings?gmail=${status}`, req.nextUrl.origin)

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL("/auth/login", req.nextUrl.origin))

    const { searchParams } = req.nextUrl
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const cookieState = req.cookies.get("gmail_oauth_state")?.value

    if (error) return NextResponse.redirect(settingsUrl("denied"))
    if (!code || !state || !cookieState || state !== cookieState) {
      return NextResponse.redirect(settingsUrl("error"))
    }

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.redirect(settingsUrl("error"))

    const tokens = await exchangeCodeForTokens(code, req.nextUrl.origin)
    if (!tokens.refresh_token) {
      // No refresh token (e.g. user previously consented) — ask them to retry.
      return NextResponse.redirect(settingsUrl("retry"))
    }

    const email = (tokens.id_token && emailFromIdToken(tokens.id_token)) || user.email || ""
    const expiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertError } = await (supabase as any)
      .from("gmail_accounts")
      .upsert(
        {
          user_id: user.id,
          org_id: profile.org_id,
          email,
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          expiry,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )

    if (upsertError) {
      console.error("Gmail upsert failed:", upsertError)
      return NextResponse.redirect(settingsUrl("error"))
    }

    const res = NextResponse.redirect(settingsUrl("connected"))
    res.cookies.delete("gmail_oauth_state")
    return res
  } catch (err) {
    console.error("Gmail callback error:", err)
    return NextResponse.redirect(settingsUrl("error"))
  }
}
