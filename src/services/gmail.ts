// Gmail send helpers. Implemented with plain fetch (no SDK) so there's no extra
// dependency. Authentication happens via Supabase "Sign in with Google" (the
// google provider, configured in the Supabase dashboard) which returns a
// provider refresh token we store in `gmail_accounts`. To mint fresh access
// tokens for sending we call Google's token endpoint with the SAME OAuth client
// credentials Supabase uses:  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

export function gmailConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
}

export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  return res.json()
}

// RFC 2047 encode a header value when it contains non-ASCII (e.g. Turkish).
function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
}

function buildRawMessage(opts: { from: string; to: string; subject: string; body: string }): string {
  const bodyB64 = Buffer.from(opts.body, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n")
  const message = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    bodyB64,
  ].join("\r\n")
  return Buffer.from(message, "utf8").toString("base64url")
}

export async function sendGmailMessage(
  accessToken: string,
  opts: { from: string; to: string; subject: string; body: string },
): Promise<void> {
  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: buildRawMessage(opts) }),
  })
  if (!res.ok) throw new Error(`Gmail send failed: ${await res.text()}`)
}
