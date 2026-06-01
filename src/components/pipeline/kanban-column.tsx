"use client"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { KanbanCard } from "./kanban-card"
import { cn } from "@/lib/utils"
import type { Lead, CRMStage } from "@/types"

interface KanbanColumnProps {
  stage: { id: CRMStage; label: string; color: string }
  leads: Lead[]
}

export function KanbanColumn({ stage, leads }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  const totalValue = leads.reduce((sum, l) => sum + (l.deal_value_estimate ?? 0), 0)

  return (
    <div className="flex w-60 shrink-0 flex-col rounded-2xl border bg-white shadow-sm overflow-hidden">
      {/* Column header */}
      <div className="px-3 py-3 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: stage.color }}
            />
            <span className="text-sm font-semibold">{stage.label}</span>
          </div>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white border text-[11px] font-bold px-1.5 text-muted-foreground">
            {leads.length}
          </span>
        </div>
        {totalValue > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1 pl-4">
            ${totalValue.toLocaleString()} pipeline
          </p>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 overflow-y-auto p-2 min-h-[200px] transition-colors rounded-b-2xl",
          isOver && "bg-primary/5 ring-2 ring-primary/20 ring-inset"
        )}
      >
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <KanbanCard key={lead.id} lead={lead} />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="flex h-16 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/15">
            <p className="text-xs text-muted-foreground/40">Drop here</p>
          </div>
        )}
      </div>
    </div>
  )
}
