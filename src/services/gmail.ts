// Gmail helpers — send + thread-based reply detection.
// Auth via Supabase Google provider; tokens stored in `gmail_accounts`.

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
const GMAIL_THREADS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/threads"

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
  if (!res.ok) {
    const body = await res.text()
    console.error("[gmail] Token refresh failed:", body)
    throw new Error(`Token refresh failed: ${body}`)
  }
  return res.json()
}

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
): Promise<{ messageId: string; threadId: string }> {
  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: buildRawMessage(opts) }),
  })
  if (!res.ok) throw new Error(`Gmail send failed: ${await res.text()}`)
  const data = await res.json()
  return { messageId: data.id as string, threadId: data.threadId as string }
}

// ─── Reply detection ──────────────────────────────────────────────────────────

export interface GmailReply {
  from: string
  body: string
  receivedAt: string
}

type GmailHeader = { name: string; value: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPlainText(payload: any): string {
  if (!payload) return ""
  if (payload.body?.data) {
    const b64 = (payload.body.data as string).replace(/-/g, "+").replace(/_/g, "/")
    return Buffer.from(b64, "base64").toString("utf8")
  }
  if (Array.isArray(payload.parts)) {
    // prefer text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        const b64 = (part.body.data as string).replace(/-/g, "+").replace(/_/g, "/")
        return Buffer.from(b64, "base64").toString("utf8")
      }
    }
    // fallback: recurse
    for (const part of payload.parts) {
      const text = extractPlainText(part)
      if (text) return text
    }
  }
  return ""
}

/**
 * Fetch the Gmail thread and return the first reply message that wasn't sent by us.
 * Returns null if no reply found or if the scope is insufficient (caller should handle 403 separately).
 */
export async function fetchThreadReply(
  accessToken: string,
  threadId: string,
  sentMessageId: string,
  ourEmail: string,
): Promise<GmailReply | null> {
  const res = await fetch(`${GMAIL_THREADS_URL}/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      throw new Error("insufficient_scope")
    }
    return null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const thread = (await res.json()) as { messages?: any[] }
  const messages = thread.messages ?? []

  for (const msg of messages) {
    if (msg.id === sentMessageId) continue
    const labels: string[] = msg.labelIds ?? []
    if (labels.includes("SENT")) continue

    const headers: GmailHeader[] = msg.payload?.headers ?? []
    const from = headers.find(h => h.name.toLowerCase() === "from")?.value ?? ""
    if (from.toLowerCase().includes(ourEmail.toLowerCase())) continue

    const dateHeader = headers.find(h => h.name.toLowerCase() === "date")?.value ?? ""
    let receivedAt = new Date().toISOString()
    try { receivedAt = new Date(dateHeader).toISOString() } catch { /* ignore */ }

    const body = extractPlainText(msg.payload).trim().slice(0, 3000)

    return { from, body, receivedAt }
  }

  return null
}
