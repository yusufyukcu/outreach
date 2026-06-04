import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Handles the redirect back from Supabase Google OAuth. Exchanges the code for a
// session and, if the login granted Gmail access, stores the provider refresh
// token so the app can send email on the user's behalf.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  const code = searchParams.get("code")
  const nextParam = searchParams.get("next") || "/app/dashboard"
  // Guard against open redirects — only allow internal paths.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app/dashboard"

  if (!code) return NextResponse.redirect(new URL("/auth/login?error=oauth", origin))

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.session) {
    return NextResponse.redirect(new URL("/auth/login?error=oauth", origin))
  }

  const session = data.session

  console.log("[gmail-callback] provider_refresh_token:", !!session.provider_refresh_token)
  console.log("[gmail-callback] provider_token:", !!session.provider_token)
  console.log("[gmail-callback] provider:", session.user?.app_metadata?.provider)

  if (!session.provider_refresh_token) {
    // No refresh token — Google didn't grant offline access.
    // This happens when: (1) gmail_send scope not in Supabase Google provider config,
    // (2) user already granted access before and Google skipped consent.
    console.warn("[gmail-callback] No refresh token received — redirecting with retry hint")
    const retryNext = next.includes("gmail=") ? next : `${next}${next.includes("?") ? "&" : "?"}gmail=retry`
    return NextResponse.redirect(new URL(retryNext, origin))
  }

  if (session.provider_refresh_token && session.user) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", session.user.id)
        .single()

      if (profile?.org_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: upsertError } = await (supabase as any).from("gmail_accounts").upsert(
          {
            user_id: session.user.id,
            org_id: profile.org_id,
            email: session.user.email ?? "",
            refresh_token: session.provider_refresh_token,
            access_token: session.provider_token ?? null,
            expiry: new Date(Date.now() + 3500 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
        if (upsertError) {
          console.error("[gmail-callback] upsert error:", upsertError)
        } else {
          console.log("[gmail-callback] gmail_accounts upserted successfully")
        }
      }
    } catch (err) {
      console.error("[gmail-callback] Failed to store Gmail tokens:", err)
    }
  }

  return NextResponse.redirect(new URL(next, origin))
}
