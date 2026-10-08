import { Scissors, ExternalLink } from "lucide-react"
import type { EditingAnalysis } from "@/types"

const DIMENSIONS: { key: keyof EditingAnalysis["dimensions"]; label: string }[] = [
  { key: "narration_visual_match", label: "Visual match" },
  { key: "visual_variety", label: "Variety" },
  { key: "pacing", label: "Pacing" },
  { key: "hook", label: "Hook" },
  { key: "technical_quality", label: "Technical" },
]

// Same palette as the thumbnail block: weak editing is highlighted, because
// for an editor that is the opportunity.
const TONES = {
  low: {
    box: { background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" },
    text: "text-red-700", soft: "text-red-600", track: "bg-red-100", bar: "bg-gradient-to-r from-red-400 to-orange-400",
  },
  mid: {
    box: { background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)" },
    text: "text-amber-700", soft: "text-amber-600", track: "bg-amber-100", bar: "bg-gradient-to-r from-amber-400 to-orange-400",
  },
  high: {
    box: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" },
    text: "text-slate-600", soft: "text-slate-500", track: "bg-slate-200", bar: "bg-gradient-to-r from-slate-400 to-slate-500",
  },
}

/** Gemini review of the channel's latest long-form video. `detailed` adds the per-dimension evidence. */
export function EditingReview({ analysis, detailed = false }: { analysis: EditingAnalysis; detailed?: boolean }) {
  const q = analysis.editing_quality
  // Same cut-offs as the lead score: below 50 "Editing gap", from 70 "Already well edited"
  const t = q < 50 ? TONES.low : q >= 70 ? TONES.high : TONES.mid

  return (
    <div className="mt-3 rounded-xl px-3 py-2" style={t.box}>
      <div className="flex items-center justify-between mb-1">
        <span className={`flex items-center gap-1 text-[11px] font-semibold ${t.text}`}>
          <Scissors className="h-3 w-3" /> Editing Quality
          <span className="ml-1 rounded-full bg-white border px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-slate-500">
            AI VIDEO ✓
          </span>
        </span>
        <span className={`text-[11px] font-bold ${t.text}`}>{q}/100</span>
      </div>
      <div className={`h-1 rounded-full overflow-hidden mb-1 ${t.track}`}>
        <div className={`h-full rounded-full transition-all duration-700 ${t.bar}`} style={{ width: `${q}%` }} />
      </div>
      {analysis.summary && <p className={`text-[11px] leading-relaxed ${t.soft}`}>{analysis.summary}</p>}

      <div className="mt-1.5 flex flex-wrap gap-1">
        {DIMENSIONS.map(({ key, label }) => (
          <span
            key={key}
            title={analysis.dimensions[key].evidence}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "rgba(255,255,255,0.06)", color: "var(--sl-fg-2)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {label} {analysis.dimensions[key].level}/5
          </span>
        ))}
      </div>

      {detailed && (
        <ul className="mt-2 space-y-1">
          {DIMENSIONS.filter(({ key }) => analysis.dimensions[key].evidence).map(({ key, label }) => (
            <li key={key} className={`text-[11px] leading-relaxed ${t.soft}`}>
              <span className="font-semibold">{label}:</span> {analysis.dimensions[key].evidence}
            </li>
          ))}
        </ul>
      )}

      {analysis.improvements.length > 0 && (
        <ul className="mt-1.5 list-disc pl-4 space-y-0.5">
          {analysis.improvements.map((tip) => (
            <li key={tip} className={`text-[11px] leading-relaxed ${t.soft}`}>{tip}</li>
          ))}
        </ul>
      )}

      <a
        href={`https://www.youtube.com/watch?v=${analysis.video_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium hover:underline ${t.soft}`}
      >
        Reviewed video <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </div>
  )
}
