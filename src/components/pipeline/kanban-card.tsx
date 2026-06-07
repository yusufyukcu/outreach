"use client"
import Link from "next/link"
import Image from "next/image"
import { PlayCircle } from "lucide-react"
import { formatNumber } from "@/lib/utils"
import type { Lead } from "@/types"

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

export function KanbanCard({ lead }: { lead: Lead }) {
  const channel = lead.channel
  return (
    <Link
      href={`/app/leads/${lead.id}`}
      className="block rounded-xl p-2.5 transition-colors"
      style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-start gap-2">
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
          <p className="text-xs font-semibold truncate text-foreground">{channel?.name ?? "Unknown"}</p>
          {channel && (
            <p className="text-[11px] text-muted-foreground">{formatNumber(channel.subscriber_count)} subs</p>
          )}
        </div>
        <ScorePill score={lead.lead_score} />
      </div>
    </Link>
  )
}
