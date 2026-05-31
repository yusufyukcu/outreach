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
    <div className="flex w-64 shrink-0 flex-col rounded-xl border bg-muted/30">
      {/* Column header */}
      <div className={cn("rounded-t-xl px-3 py-2.5", stage.color)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{stage.label}</span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/70 text-xs font-bold px-1.5">
            {leads.length}
          </span>
        </div>
        {totalValue > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            ${totalValue.toLocaleString()} pipeline
          </p>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 overflow-y-auto p-2 min-h-[200px] rounded-b-xl transition-colors",
          isOver && "bg-primary/5 ring-2 ring-primary/20 ring-inset"
        )}
      >
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <KanbanCard key={lead.id} lead={lead} />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="flex h-16 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20">
            <p className="text-xs text-muted-foreground/50">Drop here</p>
          </div>
        )}
      </div>
    </div>
  )
}
