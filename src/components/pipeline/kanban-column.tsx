"use client"
import { KanbanCard } from "./kanban-card"
import type { Lead, CRMStage } from "@/types"

interface KanbanColumnProps {
  stage: { id: CRMStage; label: string; color: string }
  leads: Lead[]
}

export function KanbanColumn({ stage, leads }: KanbanColumnProps) {
  return (
    <div className="flex w-60 shrink-0 flex-col rounded-2xl overflow-hidden" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="px-3 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: stage.color }} />
            <span className="text-sm font-semibold" style={{ color: "var(--sl-fg-1)" }}>{stage.label}</span>
          </div>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full text-[11px] font-bold px-1.5" style={{ background: "rgba(255,255,255,0.08)", color: "var(--sl-fg-3)" }}>
            {leads.length}
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2 min-h-[200px]">
        {leads.map(lead => <KanbanCard key={lead.id} lead={lead} />)}
        {leads.length === 0 && (
          <div className="flex h-16 items-center justify-center rounded-xl" style={{ border: "2px dashed rgba(255,255,255,0.06)" }}>
            <p className="text-xs text-muted-foreground/30">Empty</p>
          </div>
        )}
      </div>
    </div>
  )
}
