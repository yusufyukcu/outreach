"use client"
import Image from "next/image"
import {
  Users, Eye, PlayCircle, Plus, Check, CalendarClock,
  Clapperboard, Repeat, Mail, AlertTriangle, Sparkles, Ghost,
  TrendingUp, TrendingDown, MessageSquare, ImageIcon, Trophy, FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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

function ScoreBadge({ score }: { score: number }) {
  const gradient =
    score >= 80 ? "from-emerald-500 to-teal-400" :
    score >= 60 ? "from-indigo-500 to-violet-500" :
    score >= 40 ? "from-amber-400 to-orange-400" :
    "from-slate-400 to-slate-500"
  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-sm`}>
      <span className="text-sm font-bold text-white leading-none">{score ?? "?"}</span>
    </div>
  )
}

export function ChannelCard({ lead, onAddToLeads, isAdded, isLoading }: ChannelCardProps) {
  const m = lead.metrics

  return (
    <div className="animate-fade-in-up card-hover flex flex-col rounded-2xl border bg-white p-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border bg-muted">
          {lead.thumbnail_url ? (
            <Image src={lead.thumbnail_url} alt={lead.name} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <PlayCircle className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{lead.name}</p>
              {lead.handle && <p className="text-xs text-muted-foreground truncate">{lead.handle}</p>}
            </div>
            <ScoreBadge score={lead.score} />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {lead.niche_primary && (
              <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                {lead.niche_primary}
              </span>
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
                POSITIVE_BADGES.has(b)
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-blue-50 text-blue-700 border border-blue-200"
              }`}
            >
              {b === "Business email found" && <Mail className="h-3 w-3" />}
              {b}
            </span>
          ))}
          {lead.warnings.map((w) => (
            <span
              key={w}
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-700"
            >
              <AlertTriangle className="h-3 w-3" />
              {w}
            </span>
          ))}
        </div>
      )}

      {/* Faceless score */}
      {lead.faceless_score > 0 && (
        <div className={`mt-3 rounded-xl px-3 py-2 ${
          lead.faceless_score >= 60
            ? "bg-indigo-50 border border-indigo-100"
            : lead.faceless_score <= 20
            ? "bg-red-50 border border-red-100"
            : "bg-muted/40"
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`flex items-center gap-1 text-[11px] font-semibold ${
              lead.faceless_score <= 20 ? "text-red-600" : "text-indigo-700"
            }`}>
              <Ghost className="h-3 w-3" />
              {lead.faceless_score <= 20 ? "Face-cam Channel" : "Faceless Score"}
              {lead.thumbnail_quality?.face_confidence && lead.thumbnail_quality.face_confidence >= 60 && (
                <span className="ml-1 rounded-full bg-white border px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-slate-500">
                  AI VISION ✓
                </span>
              )}
            </span>
            <span className={`text-[11px] font-bold ${
              lead.faceless_score >= 70 ? "text-indigo-700" :
              lead.faceless_score >= 45 ? "text-amber-600" :
              lead.faceless_score <= 20 ? "text-red-500" : "text-muted-foreground"
            }`}>{lead.faceless_score}/100</span>
          </div>
          <div className={`h-1 rounded-full overflow-hidden ${lead.faceless_score <= 20 ? "bg-red-100" : "bg-indigo-100"}`}>
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                lead.faceless_score <= 20
                  ? "bg-gradient-to-r from-red-400 to-rose-500"
                  : "bg-gradient-to-r from-indigo-500 to-violet-500"
              }`}
              style={{ width: `${lead.faceless_score}%` }}
            />
          </div>
          {lead.faceless_signals.length > 0 && (
            <p className={`text-[11px] leading-relaxed mt-1 ${lead.faceless_score <= 20 ? "text-red-500" : "text-indigo-600"}`}>
              {lead.faceless_signals[0]}
            </p>
          )}
        </div>
      )}

      {/* Semantic relevance */}
      {lead.relevance_explanation && (
        <div className="mt-3 rounded-xl bg-violet-50 border border-violet-100 px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-violet-700">
              <Sparkles className="h-3 w-3" /> Content Relevance
            </span>
            <span className={`text-[11px] font-bold ${
              lead.relevance_score >= 60 ? "text-violet-700" :
              lead.relevance_score >= 35 ? "text-amber-600" : "text-red-500"
            }`}>{lead.relevance_score}/100</span>
          </div>
          <div className="h-1 rounded-full bg-violet-100 overflow-hidden mb-1">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-400 transition-all duration-700"
              style={{ width: `${lead.relevance_score}%` }}
            />
          </div>
          <p className="text-[11px] text-violet-600 leading-relaxed">{lead.relevance_explanation}</p>
        </div>
      )}

      {/* Upload Trend */}
      {(m.upload_trend === "growing" || m.upload_trend === "declining") && (
        <div className={`mt-3 rounded-xl px-3 py-2 ${m.upload_trend === "growing" ? "bg-emerald-50 border border-emerald-100" : "bg-amber-50 border border-amber-100"}`}>
          <div className="flex items-center gap-1.5">
            {m.upload_trend === "growing"
              ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              : <TrendingDown className="h-3.5 w-3.5 text-amber-600" />}
            <span className={`text-[11px] font-semibold ${m.upload_trend === "growing" ? "text-emerald-700" : "text-amber-700"}`}>
              {m.upload_trend === "growing"
                ? `Views trending +${m.upload_trend_pct}%`
                : `Views down ${Math.abs(m.upload_trend_pct)}% — burnout signal`}
            </span>
          </div>
        </div>
      )}

      {/* Comment Signals */}
      {lead.comment_signals != null && lead.comment_signals.score > 30 && (
        <div className={`mt-3 rounded-xl px-3 py-2 ${lead.comment_signals.needs_help ? "bg-emerald-50 border border-emerald-100" : "bg-slate-50 border border-slate-100"}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <MessageSquare className={`h-3.5 w-3.5 ${lead.comment_signals.needs_help ? "text-emerald-600" : "text-slate-500"}`} />
            <span className={`text-[11px] font-semibold ${lead.comment_signals.needs_help ? "text-emerald-700" : "text-slate-600"}`}>
              Comment Signals
            </span>
            <span className={`ml-auto text-[11px] font-bold ${lead.comment_signals.needs_help ? "text-emerald-700" : "text-slate-500"}`}>
              {lead.comment_signals.score}/100
            </span>
          </div>
          <p className={`text-[11px] leading-relaxed ${lead.comment_signals.needs_help ? "text-emerald-600" : "text-slate-500"}`}>
            {lead.comment_signals.signal}
          </p>
        </div>
      )}

      {/* Thumbnail Quality */}
      {lead.thumbnail_quality != null && (
        <div className={`mt-3 rounded-xl px-3 py-2 ${lead.thumbnail_quality.score < 50 ? "bg-red-50 border border-red-100" : lead.thumbnail_quality.score > 75 ? "bg-slate-50 border border-slate-100" : "bg-amber-50 border border-amber-100"}`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`flex items-center gap-1 text-[11px] font-semibold ${lead.thumbnail_quality.score < 50 ? "text-red-700" : lead.thumbnail_quality.score > 75 ? "text-slate-600" : "text-amber-700"}`}>
              <ImageIcon className="h-3 w-3" /> Thumbnail Quality
            </span>
            <span className={`text-[11px] font-bold ${lead.thumbnail_quality.score < 50 ? "text-red-700" : lead.thumbnail_quality.score > 75 ? "text-slate-500" : "text-amber-700"}`}>
              {lead.thumbnail_quality.score}/100
            </span>
          </div>
          <div className={`h-1 rounded-full overflow-hidden mb-1 ${lead.thumbnail_quality.score < 50 ? "bg-red-100" : lead.thumbnail_quality.score > 75 ? "bg-slate-200" : "bg-amber-100"}`}>
            <div
              className={`h-full rounded-full transition-all duration-700 ${lead.thumbnail_quality.score < 50 ? "bg-gradient-to-r from-red-400 to-orange-400" : lead.thumbnail_quality.score > 75 ? "bg-gradient-to-r from-slate-400 to-slate-500" : "bg-gradient-to-r from-amber-400 to-orange-400"}`}
              style={{ width: `${lead.thumbnail_quality.score}%` }}
            />
          </div>
          <p className={`text-[11px] leading-relaxed ${lead.thumbnail_quality.score < 50 ? "text-red-600" : lead.thumbnail_quality.score > 75 ? "text-slate-500" : "text-amber-600"}`}>
            {lead.thumbnail_quality.signal}
          </p>
        </div>
      )}

      {/* Transcript Analysis */}
      {lead.transcript_analysis != null && (lead.transcript_analysis.editing_need_score > 20 || lead.transcript_analysis.faceless_confidence >= 65) && (
        <div className="mt-3 rounded-xl bg-sky-50 border border-sky-100 px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-sky-700">
              <FileText className="h-3 w-3" /> Transcript Analysis
            </span>
            <span className={`text-[11px] font-bold ${lead.transcript_analysis.editing_need_score >= 60 ? "text-sky-700" : lead.transcript_analysis.editing_need_score >= 35 ? "text-amber-600" : "text-slate-500"}`}>
              Need {lead.transcript_analysis.editing_need_score}/100
            </span>
          </div>
          <div className="h-1 rounded-full bg-sky-100 overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-700"
              style={{ width: `${lead.transcript_analysis.editing_need_score}%` }}
            />
          </div>
          {lead.transcript_analysis.faceless_signal && (
            <p className="text-[11px] text-sky-600 leading-relaxed mb-1">{lead.transcript_analysis.faceless_signal}</p>
          )}
          {lead.transcript_analysis.editing_signals.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {lead.transcript_analysis.editing_signals.map((sig) => (
                <span key={sig} className="inline-flex items-center rounded-full bg-sky-100 border border-sky-200 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                  {sig}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Won Similarity */}
      {lead.won_similarity != null && lead.won_similarity > 20 && (
        <div className="mt-3 rounded-xl bg-green-50 border border-green-100 px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-green-700">
              <Trophy className="h-3 w-3" /> Won Client Match
            </span>
            <span className="text-[11px] font-bold text-green-700">{lead.won_similarity}%</span>
          </div>
          <div className="h-1 rounded-full bg-green-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-700"
              style={{ width: `${lead.won_similarity}%` }}
            />
          </div>
          <p className="text-[11px] text-green-600 mt-1">{lead.won_similarity}% match to your won clients</p>
        </div>
      )}

      {/* Reasoning */}
      <p className="mt-3 text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/20 pl-2.5">
        {lead.reasoning}
      </p>

      {/* Action */}
      {onAddToLeads && (
        <div className="mt-4 flex items-center justify-between">
          {lead.business_email ? (
            <span className="flex items-center gap-1 text-xs text-emerald-700 truncate max-w-[55%]">
              <Mail className="h-3 w-3 shrink-0" />
              {lead.business_email}
            </span>
          ) : <span />}
          <Button
            size="sm"
            variant={isAdded ? "secondary" : "default"}
            onClick={() => !isAdded && onAddToLeads(lead)}
            disabled={isAdded || isLoading}
            className={isAdded ? "" : "btn-glow"}
          >
            {isAdded ? (
              <><Check className="h-3 w-3 mr-1" /> Added</>
            ) : isLoading ? "Adding..." : (
              <><Plus className="h-3 w-3 mr-1" /> Add to Leads</>
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
    <div className="rounded-xl border bg-muted/30 px-2.5 py-2">
      <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className={`font-semibold text-xs ${danger ? "text-amber-600" : "text-foreground"}`}>{value}</p>
    </div>
  )
}
