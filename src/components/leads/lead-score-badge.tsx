import { cn, getScoreBg, getScoreLabel } from "@/lib/utils"

interface LeadScoreBadgeProps {
  score: number | null
  showLabel?: boolean
  size?: "sm" | "md" | "lg"
}

export function LeadScoreBadge({ score, showLabel = false, size = "md" }: LeadScoreBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium border-gray-200 bg-gray-50 text-gray-500">
        Not scored
      </span>
    )
  }

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2.5 py-0.5",
    lg: "text-base px-3 py-1",
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center rounded-md border font-semibold",
          sizeClasses[size],
          getScoreBg(score)
        )}
      >
        {score}
      </span>
      {showLabel && (
        <span className="text-xs text-muted-foreground">{getScoreLabel(score)}</span>
      )}
    </div>
  )
}
