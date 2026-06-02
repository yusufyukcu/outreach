// Gmail OAuth + send helpers. Implemented with plain fetch (no SDK) so there's
// no extra dependency. The OAuth client credentials come from env:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// The redirect URI is `${APP_URL}/api/gmail/callback` and must be registered
// in the Google Cloud Console OAuth client.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

// Send scope + identity so we can read the connected address from the id_token.
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
].join(" ")

export function gmailConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
}

export function getRedirectUri(origin: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || origin
  return `${base}/api/gmail/callback`
}

export function buildAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: getRedirectUri(origin),
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent", // force a refresh_token every time
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  id_token?: string
  scope?: string
}

export async function exchangeCodeForTokens(code: string, origin: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  return res.json()
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

/** Pull the email address out of a Google id_token (JWT) without verifying it. */
export function emailFromIdToken(idToken: string): string | null {
  try {
    const payload = idToken.split(".")[1]
    const json = Buffer.from(payload, "base64").toString("utf8")
    return JSON.parse(json).email ?? null
  } catch {
    return null
  }
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
