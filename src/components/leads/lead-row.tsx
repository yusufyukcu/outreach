"use client"
import Link from "next/link"
import Image from "next/image"
import { PlayCircle, Mail, AtSign, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { LeadScoreBadge } from "./lead-score-badge"
import { formatNumber, timeAgo } from "@/lib/utils"
import type { Lead, CRMStage } from "@/types"

const STAGE_COLORS: Record<CRMStage, string> = {
  new: "bg-gray-100 text-gray-700",
  analyzed: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  replied: "bg-purple-100 text-purple-700",
  interested: "bg-indigo-100 text-indigo-700",
  meeting_scheduled: "bg-orange-100 text-orange-700",
  proposal_sent: "bg-pink-100 text-pink-700",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-red-100 text-red-700",
}

const STAGE_LABELS: Record<CRMStage, string> = {
  new: "New",
  analyzed: "Analyzed",
  contacted: "Contacted",
  replied: "Replied",
  interested: "Interested",
  meeting_scheduled: "Meeting",
  proposal_sent: "Proposal",
  won: "Won",
  lost: "Lost",
}

interface LeadRowProps {
  lead: Lead
}

export function LeadRow({ lead }: LeadRowProps) {
  const channel = lead.channel
  const contact = lead.contact

  return (
    <Link href={`/app/leads/${lead.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors border-b last:border-0">
      {/* Avatar */}
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border bg-muted">
        {channel?.thumbnail_url ? (
          <Image src={channel.thumbnail_url} alt={channel.name} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PlayCircle className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Channel info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{channel?.name ?? "Unknown"}</p>
          {channel?.niche_primary && (
            <Badge variant="secondary" className="hidden md:inline-flex text-xs">
              {channel.niche_primary}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {channel ? formatNumber(channel.subscriber_count) + " subs" : "—"}
          </span>
          {contact?.email && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />
              {contact.email}
            </span>
          )}
        </div>
      </div>

      {/* Score */}
      <div className="hidden sm:block w-20 text-right">
        <LeadScoreBadge score={lead.lead_score} />
      </div>

      {/* Stage */}
      <div className="hidden md:block w-28 text-right">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_COLORS[lead.crm_stage]}`}>
          {STAGE_LABELS[lead.crm_stage]}
        </span>
      </div>

      {/* Last activity */}
      <div className="hidden lg:block w-24 text-right">
        <span className="text-xs text-muted-foreground">
          {lead.last_contacted_at ? timeAgo(lead.last_contacted_at) : timeAgo(lead.created_at)}
        </span>
      </div>
    </Link>
  )
}
