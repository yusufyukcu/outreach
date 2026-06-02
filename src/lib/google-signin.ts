"use client"
import { createClient } from "@/lib/supabase/client"

// Requesting the Gmail send scope during login means the same "Sign in with
// Google" step also grants permission to send email — no separate connect step.
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"

/**
 * Start the Supabase Google OAuth flow. `next` is where the user lands after the
 * /auth/callback handler runs (where provider tokens are captured).
 * Returns an Error if the redirect couldn't be initiated.
 */
export async function signInWithGoogle(next: string = "/app/dashboard"): Promise<Error | null> {
  const supabase = createClient()
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      // access_type=offline + prompt=consent ensures Google returns a refresh
      // token we can store for sending later.
      scopes: GMAIL_SEND_SCOPE,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  })
  return error
}
