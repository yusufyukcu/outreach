"use client"
import Link from "next/link"
import Image from "next/image"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { PlayCircle, GripVertical } from "lucide-react"
import { LeadScoreBadge } from "@/components/leads/lead-score-badge"
import { formatNumber, formatCurrency, cn } from "@/lib/utils"
import type { Lead } from "@/types"

interface KanbanCardProps {
  lead: Lead
  isDragging?: boolean
}

export function KanbanCard({ lead, isDragging }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({ id: lead.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const channel = lead.channel

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border bg-white p-2.5 shadow-sm cursor-grab active:cursor-grabbing",
        (isDragging || isSortableDragging) && "opacity-50 shadow-lg rotate-1"
      )}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <div {...attributes} {...listeners} className="mt-0.5 shrink-0 cursor-grab text-muted-foreground/30 hover:text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Thumbnail */}
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border bg-muted">
          {channel?.thumbnail_url ? (
            <Image src={channel.thumbnail_url} alt={channel.name} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <PlayCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <Link href={`/app/leads/${lead.id}`} onClick={e => e.stopPropagation()}>
            <p className="text-xs font-semibold truncate hover:text-primary transition-colors">
              {channel?.name ?? "Unknown"}
            </p>
          </Link>
          {channel && (
            <p className="text-xs text-muted-foreground">{formatNumber(channel.subscriber_count)} subs</p>
          )}
        </div>

        <LeadScoreBadge score={lead.lead_score} size="sm" />
      </div>

      {lead.deal_value_estimate && (
        <div className="mt-2 flex justify-end">
          <span className="text-xs text-emerald-700 font-medium bg-emerald-50 rounded px-1.5 py-0.5">
            {formatCurrency(lead.deal_value_estimate)}
          </span>
        </div>
      )}
    </div>
  )
}
