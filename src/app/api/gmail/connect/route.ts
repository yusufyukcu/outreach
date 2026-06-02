import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildAuthUrl, gmailConfigured } from "@/services/gmail"

// Kick off the Gmail OAuth flow: set a CSRF state cookie and redirect to Google.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL("/auth/login", req.nextUrl.origin))

  if (!gmailConfigured()) {
    return NextResponse.redirect(new URL("/app/settings?gmail=not_configured", req.nextUrl.origin))
  }

  const state = crypto.randomUUID()
  const res = NextResponse.redirect(buildAuthUrl(req.nextUrl.origin, state))
  res.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  })
  return res
}
