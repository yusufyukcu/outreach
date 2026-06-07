export type ReplyClassification =
  | "positive"
  | "neutral"
  | "negative"
  | "sample_request"
  | "pricing_request"
  | "meeting_request"
  | "interested"
  | "not_interested"
  | "hired_editor_already"
  | "future_interest"
  | "other"

// Keyword-based reply classification — pure function, no AI, no side-effects.
export function classifyReply(body: string): ReplyClassification {
  const t = body.toLowerCase()

  if (/not interested|no thank|please stop|unsubscribe|remove me|don.t contact|stop email/i.test(t))
    return "not_interested"
  if (/already have.{0,20}(editor|team|someone)|found.{0,10}(someone|editor|agency)|hired|working with (someone|an editor|a team)/i.test(t))
    return "hired_editor_already"
  if (/in the future|down the line|maybe later|sometime|keep in touch|reach out again|not right now/i.test(t))
    return "future_interest"
  if (/sample|portfolio|example|demo|past work|show me|your work|previous work|reel/i.test(t))
    return "sample_request"
  if (/price|cost|rate|how much|pricing|fee|budget|quote|charge/i.test(t))
    return "pricing_request"
  if (/call|meeting|schedule|zoom|meet( up)?|chat|calendly|available|book a/i.test(t))
    return "meeting_request"
  if (/interest|love to|sounds good|tell me more|let.s do|would like|definitely|yes please|absolutely|sure|great idea/i.test(t))
    return "interested"
  if (/great|awesome|perfect|exactly what|love it|^yes|^sure|^thanks/i.test(t))
    return "positive"
  if (/not |no |don.t|can.t|won.t|unfortunately|however|but we|we.re (not|all set)/i.test(t))
    return "negative"
  return "neutral"
}

// Compute how many hours elapsed between two ISO timestamps.
// Returns null if either value is missing or invalid.
export function computeResponseHours(sentAt: string | null, repliedAt: string | null): number | null {
  if (!sentAt || !repliedAt) return null
  const sent = new Date(sentAt).getTime()
  const replied = new Date(repliedAt).getTime()
  if (isNaN(sent) || isNaN(replied) || replied < sent) return null
  return Math.round(((replied - sent) / 3_600_000) * 100) / 100
}

// Human-readable label for each classification.
export const CLASSIFICATION_LABELS: Record<ReplyClassification, string> = {
  positive:               "Positive",
  neutral:                "Neutral",
  negative:               "Negative",
  sample_request:         "Sample Request",
  pricing_request:        "Pricing Request",
  meeting_request:        "Meeting Request",
  interested:             "Interested",
  not_interested:         "Not Interested",
  hired_editor_already:   "Has Editor",
  future_interest:        "Future Interest",
  other:                  "Other",
}

// Color styles for each classification pill.
export const CLASSIFICATION_STYLES: Record<ReplyClassification, React.CSSProperties> = {
  positive:             { background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" },
  interested:           { background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" },
  sample_request:       { background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" },
  pricing_request:      { background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" },
  meeting_request:      { background: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)" },
  future_interest:      { background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" },
  neutral:              { background: "rgba(255,255,255,0.06)", color: "hsl(220 9% 56%)", border: "1px solid rgba(255,255,255,0.1)" },
  negative:             { background: "rgba(248,113,113,0.08)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" },
  not_interested:       { background: "rgba(248,113,113,0.08)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" },
  hired_editor_already: { background: "rgba(248,113,113,0.08)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" },
  other:                { background: "rgba(255,255,255,0.06)", color: "hsl(220 9% 56%)", border: "1px solid rgba(255,255,255,0.1)" },
}
