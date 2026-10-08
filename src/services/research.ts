import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

// ─── Research data collection ────────────────────────────────────────────────
// Background logging for the research article. Rows go to `research_events`
// (migration 0004) and nothing in the app reads them, so a failed write must
// never affect the request that produced it. Only derived scores, flags and
// public YouTube IDs are stored — no comment text, transcripts, e-mail
// addresses or message bodies. Set RESEARCH_LOGGING=off to disable.

export const RESEARCH_SCHEMA_VERSION = 1

export type ResearchEventType = "discovery_run" | "lead_signals" | "email_generated"

export interface ResearchEvent {
  org_id: string
  event_type: ResearchEventType
  channel_id?: string | null
  lead_id?: string | null
  payload: Record<string, unknown>
}

function researchLoggingEnabled(): boolean {
  const flag = process.env.RESEARCH_LOGGING?.trim().toLowerCase()
  return flag !== "off" && flag !== "false" && flag !== "0"
}

export async function recordResearchEvents(supabase: SupabaseClient, events: ResearchEvent[]): Promise<void> {
  if (events.length === 0 || !researchLoggingEnabled()) return
  try {
    const rows = events.map((e) => ({
      ...e,
      payload: { schema_version: RESEARCH_SCHEMA_VERSION, ...e.payload },
    }))
    const { error } = await supabase.from("research_events").insert(rows)
    if (error) console.warn("[research] insert failed:", error.message)
  } catch (err) {
    console.warn("[research] insert failed:", err instanceof Error ? err.message : err)
  }
}

// Whitespace-normalized SHA-256, so a generated draft can later be matched
// against the sent body (edited vs. sent as generated) without storing it twice.
export function textHash(text: string): string {
  return createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex")
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

// The AI analyzers return placeholder results instead of throwing (e.g. a
// thumbnail score of 50 on failure). These are their placeholder signals, so
// research data can tell a real score from a fallback.
const FALLBACK_SIGNALS = new Set([
  "Analysis unavailable",
  "Analysis failed",
  "No response",
  "OpenAI not configured",
  "No comments available",
])

export function analysisSucceeded(signal: string): boolean {
  return !FALLBACK_SIGNALS.has(signal)
}
