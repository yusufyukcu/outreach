import { Progress } from "@/components/ui/progress"
import { getScoreExplanations } from "@/services/scoring"
import type { ScoreBreakdown } from "@/types"

interface ScoreBreakdownPanelProps {
  breakdown: ScoreBreakdown
}

const MAX_SCORES: Record<keyof Omit<ScoreBreakdown, "total">, number> = {
  growth_velocity: 20,
  upload_frequency: 10,
  revenue_potential: 15,
  subscriber_sweet_spot: 10,
  outsourcing_likelihood: 15,
  quality_gap: 15,
  engagement_quality: 10,
  content_consistency: 5,
}

export function ScoreBreakdownPanel({ breakdown }: ScoreBreakdownPanelProps) {
  const explanations = getScoreExplanations(breakdown)

  return (
    <div className="space-y-3">
      {(Object.keys(MAX_SCORES) as Array<keyof typeof MAX_SCORES>).map((key) => {
        const score = breakdown[key]
        const max = MAX_SCORES[key]
        const label = Object.keys(explanations)[Object.keys(MAX_SCORES).indexOf(key)]
        const explanation = explanations[label]
        const pct = Math.round((score / max) * 100)

        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-foreground">{label}</span>
              <span className="text-xs font-semibold">
                {score}<span className="text-muted-foreground font-normal">/{max}</span>
              </span>
            </div>
            <Progress value={pct} className="h-1.5" />
            <p className="mt-0.5 text-xs text-muted-foreground">{explanation?.split(" — ")[1]}</p>
          </div>
        )
      })}

      <div className="mt-4 rounded-lg bg-muted p-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Total Score</span>
        <span className="text-2xl font-bold text-primary">{breakdown.total}<span className="text-sm text-muted-foreground font-normal">/100</span></span>
      </div>
    </div>
  )
}
