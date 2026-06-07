import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  if (error || !code) {
    return NextResponse.redirect(new URL("/app/settings?gmail=denied", origin))
  }

  // Exchange code directly with Google
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${origin}/api/gmail/oauth-callback`,
      grant_type: "authorization_code",
    }),
  })

  if (!tokenRes.ok) {
    console.error("[gmail-oauth-callback] token exchange failed:", await tokenRes.text())
    return NextResponse.redirect(new URL("/app/settings?gmail=error", origin))
  }

  const tokens = await tokenRes.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  if (!tokens.refresh_token) {
    console.warn("[gmail-oauth-callback] no refresh_token returned")
    return NextResponse.redirect(new URL("/app/settings?gmail=retry", origin))
  }

  // Get the email address from Google
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const userInfo = await userInfoRes.json() as { email?: string }
  const email = userInfo.email ?? ""

  // Get the logged-in user from the Supabase session cookie
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL("/auth/login", origin))

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single()

  if (!profile?.org_id) {
    return NextResponse.redirect(new URL("/app/settings?gmail=error", origin))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertError } = await (supabase as any).from("gmail_accounts").upsert(
    {
      user_id: user.id,
      org_id: profile.org_id,
      email,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expiry: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  )

  if (upsertError) {
    console.error("[gmail-oauth-callback] upsert error:", upsertError)
    return NextResponse.redirect(new URL("/app/settings?gmail=error", origin))
  }

  return NextResponse.redirect(new URL("/app/settings?gmail=connected", origin))
}
