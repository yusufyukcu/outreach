"use client"
import Image from "next/image"
import {
  Users, Eye, PlayCircle, Plus, Check, CalendarClock,
  Clapperboard, Repeat, Mail, AlertTriangle, Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LeadScoreBadge } from "./lead-score-badge"
import { formatNumber, timeAgo } from "@/lib/utils"
import type { DiscoveredLead } from "@/types"

interface ChannelCardProps {
  lead: DiscoveredLead
  onAddToLeads?: (lead: DiscoveredLead) => void
  isAdded?: boolean
  isLoading?: boolean
}

const POSITIVE_BADGES = new Set([
  "Active", "Long-form", "Strong views", "Consistent", "Business email found", "Contact links", "Has sponsors",
])

export function ChannelCard({ lead, onAddToLeads, isAdded, isLoading }: ChannelCardProps) {
  const m = lead.metrics

  return (
    <div className="flex flex-col rounded-xl border bg-white p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border bg-muted">
          {lead.thumbnail_url ? (
            <Image src={lead.thumbnail_url} alt={lead.name} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <PlayCircle className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{lead.name}</p>
              {lead.handle && <p className="text-xs text-muted-foreground truncate">{lead.handle}</p>}
            </div>
            <LeadScoreBadge score={lead.score} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {lead.niche_primary && (
              <Badge variant="secondary" className="text-xs">{lead.niche_primary}</Badge>
            )}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {formatNumber(lead.subscriber_count)}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric
          icon={<CalendarClock className="h-3.5 w-3.5" />}
          label="Last upload"
          value={m.last_upload_at ? timeAgo(m.last_upload_at) : "Unknown"}
          danger={m.days_since_upload !== null && m.days_since_upload > 30}
        />
        <Metric
          icon={<Eye className="h-3.5 w-3.5" />}
          label="Avg recent views"
          value={formatNumber(m.median_recent_views)}
        />
        <Metric
          icon={<Repeat className="h-3.5 w-3.5" />}
          label="Upload freq"
          value={`${m.upload_frequency_per_week}/wk`}
        />
        <Metric
          icon={<Clapperboard className="h-3.5 w-3.5" />}
          label="Long-form"
          value={`${m.long_form_pct}%`}
          danger={m.long_form_pct < 30}
        />
      </div>

      {/* Badges */}
      {(lead.badges.length > 0 || lead.warnings.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1">
          {lead.badges.map((b) => (
            <span
              key={b}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                POSITIVE_BADGES.has(b) ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
              }`}
            >
              {b === "Business email found" && <Mail className="h-3 w-3" />}
              {b}
            </span>
          ))}
          {lead.warnings.map((w) => (
            <span
              key={w}
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
            >
              <AlertTriangle className="h-3 w-3" />
              {w}
            </span>
          ))}
        </div>
      )}

      {/* Semantic relevance */}
      {lead.relevance_explanation && (
        <div className="mt-3 rounded-lg bg-violet-50 px-2.5 py-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-violet-700">
              <Sparkles className="h-3 w-3" /> Content Relevance
            </span>
            <span className={`text-[11px] font-bold ${
              lead.relevance_score >= 60 ? "text-violet-700" :
              lead.relevance_score >= 35 ? "text-amber-600" : "text-red-500"
            }`}>{lead.relevance_score}/100</span>
          </div>
          <p className="text-[11px] text-violet-600 leading-relaxed">{lead.relevance_explanation}</p>
        </div>
      )}

      {/* Reasoning */}
      <p className="mt-3 text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/20 pl-2">
        {lead.reasoning}
      </p>

      {/* Action */}
      {onAddToLeads && (
        <div className="mt-3 flex items-center justify-between">
          {lead.business_email ? (
            <span className="flex items-center gap-1 text-xs text-emerald-700 truncate max-w-[60%]">
              <Mail className="h-3 w-3 shrink-0" />
              {lead.business_email}
            </span>
          ) : <span />}
          <Button
            size="sm"
            variant={isAdded ? "secondary" : "default"}
            onClick={() => !isAdded && onAddToLeads(lead)}
            disabled={isAdded || isLoading}
          >
            {isAdded ? (
              <><Check className="h-3 w-3" /> Added</>
            ) : isLoading ? "Adding..." : (
              <><Plus className="h-3 w-3" /> Add to Leads</>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

function Metric({ icon, label, value, danger }: {
  icon: React.ReactNode
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-2 py-1.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className={`mt-0.5 font-semibold ${danger ? "text-amber-600" : "text-foreground"}`}>{value}</p>
    </div>
  )
}
