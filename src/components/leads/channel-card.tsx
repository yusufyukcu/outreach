"use client"
import Image from "next/image"
import { Users, Eye, TrendingUp, PlayCircle, Plus, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LeadScoreBadge } from "./lead-score-badge"
import { formatNumber, formatCurrency } from "@/lib/utils"
import type { Channel } from "@/types"

interface ChannelCardProps {
  channel: Channel & { score?: number }
  onAddToLeads?: (channel: Channel & { score: number }) => void
  isAdded?: boolean
  isLoading?: boolean
}

export function ChannelCard({ channel, onAddToLeads, isAdded, isLoading }: ChannelCardProps) {
  return (
    <div className="rounded-xl border bg-white p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border bg-muted">
          {channel.thumbnail_url ? (
            <Image
              src={channel.thumbnail_url}
              alt={channel.name}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <PlayCircle className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{channel.name}</p>
              {channel.handle && (
                <p className="text-xs text-muted-foreground">{channel.handle}</p>
              )}
            </div>
            {channel.score !== undefined && (
              <LeadScoreBadge score={channel.score} />
            )}
          </div>

          {/* Niche */}
          {channel.niche_primary && (
            <Badge variant="secondary" className="mt-1 text-xs">
              {channel.niche_primary}
            </Badge>
          )}

          {/* Stats row */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {formatNumber(channel.subscriber_count)}
            </span>
            {channel.avg_views_30d && (
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {formatNumber(channel.avg_views_30d)}/video
              </span>
            )}
            {channel.growth_trend_30d !== null && channel.growth_trend_30d !== undefined && (
              <span className={`flex items-center gap-1 ${channel.growth_trend_30d > 0 ? "text-emerald-600" : "text-red-500"}`}>
                <TrendingUp className="h-3 w-3" />
                {channel.growth_trend_30d > 0 ? "+" : ""}{channel.growth_trend_30d.toFixed(1)}%
              </span>
            )}
            {channel.estimated_monthly_revenue_max && (
              <span className="text-emerald-700 font-medium">
                ~{formatCurrency(channel.estimated_monthly_revenue_max)}/mo
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {channel.description && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
          {channel.description}
        </p>
      )}

      {/* Action */}
      {onAddToLeads && (
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            variant={isAdded ? "secondary" : "default"}
            onClick={() => !isAdded && onAddToLeads({ ...channel, score: channel.score ?? 0 })}
            disabled={isAdded || isLoading}
          >
            {isAdded ? (
              <><Check className="h-3 w-3" /> Added</>
            ) : isLoading ? (
              "Adding..."
            ) : (
              <><Plus className="h-3 w-3" /> Add to Leads</>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
