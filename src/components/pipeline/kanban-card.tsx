"use client"
import Link from "next/link"
import Image from "next/image"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { PlayCircle, GripVertical } from "lucide-react"
import { formatNumber, formatCurrency, cn } from "@/lib/utils"
import type { Lead } from "@/types"

interface KanbanCardProps {
  lead: Lead
  isDragging?: boolean
}

function ScorePill({ score }: { score: number | null }) {
  const gradient =
    (score ?? 0) >= 80 ? "from-emerald-500 to-teal-400" :
    (score ?? 0) >= 60 ? "from-indigo-500 to-violet-500" :
    (score ?? 0) >= 40 ? "from-amber-400 to-orange-400" :
    "from-slate-400 to-slate-500"
  return (
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient} shadow-sm`}>
      <span className="text-[10px] font-bold text-white leading-none">{score ?? "?"}</span>
    </div>
  )
}

export function KanbanCard({ lead, isDragging }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({ id: lead.id })

  const style = { transform: CSS.Transform.toString(transform), transition }
  const channel = lead.channel

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "card-hover rounded-xl border bg-white p-2.5 shadow-sm cursor-grab active:cursor-grabbing",
        (isDragging || isSortableDragging) && "opacity-40 shadow-xl rotate-2 scale-105"
      )}
    >
      <div className="flex items-start gap-2">
        <div {...attributes} {...listeners} className="mt-0.5 shrink-0 cursor-grab text-muted-foreground/30 hover:text-muted-foreground transition-colors">
          <GripVertical className="h-4 w-4" />
        </div>

        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border bg-muted">
          {channel?.thumbnail_url ? (
            <Image src={channel.thumbnail_url} alt={channel.name} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <PlayCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <Link href={`/app/leads/${lead.id}`} onClick={e => e.stopPropagation()}>
            <p className="text-xs font-semibold truncate hover:text-primary transition-colors">
              {channel?.name ?? "Unknown"}
            </p>
          </Link>
          {channel && (
            <p className="text-[11px] text-muted-foreground">{formatNumber(channel.subscriber_count)} subs</p>
          )}
        </div>

        <ScorePill score={lead.lead_score} />
      </div>

      {lead.deal_value_estimate && (
        <div className="mt-2 flex justify-end">
          <span className="inline-flex items-center rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            {formatCurrency(lead.deal_value_estimate)}
          </span>
        </div>
      )}
    </div>
  )
}
