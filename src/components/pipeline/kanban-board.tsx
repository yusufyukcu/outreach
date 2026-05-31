"use client"
import { useState } from "react"
import { DndContext, DragOverlay, closestCorners, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core"
import { KanbanColumn } from "./kanban-column"
import { KanbanCard } from "./kanban-card"
import type { Lead, CRMStage } from "@/types"
import { toast } from "@/hooks/use-toast"

const STAGES: { id: CRMStage; label: string; color: string }[] = [
  { id: "new", label: "New", color: "bg-gray-100" },
  { id: "analyzed", label: "Analyzed", color: "bg-blue-50" },
  { id: "contacted", label: "Contacted", color: "bg-yellow-50" },
  { id: "replied", label: "Replied", color: "bg-purple-50" },
  { id: "interested", label: "Interested", color: "bg-indigo-50" },
  { id: "meeting_scheduled", label: "Meeting", color: "bg-orange-50" },
  { id: "proposal_sent", label: "Proposal", color: "bg-pink-50" },
  { id: "won", label: "Won ✓", color: "bg-emerald-50" },
  { id: "lost", label: "Lost", color: "bg-red-50" },
]

interface KanbanBoardProps {
  leads: Lead[]
  onStageChange: (leadId: string, newStage: CRMStage) => Promise<void>
}

export function KanbanBoard({ leads, onStageChange }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [optimisticLeads, setOptimisticLeads] = useState<Lead[]>(leads)

  const activeLead = activeId ? optimisticLeads.find(l => l.id === activeId) : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const leadId = active.id as string
    const newStage = over.id as CRMStage

    const lead = optimisticLeads.find(l => l.id === leadId)
    if (!lead || lead.crm_stage === newStage) return

    // Optimistic update
    setOptimisticLeads(prev =>
      prev.map(l => l.id === leadId ? { ...l, crm_stage: newStage } : l)
    )

    try {
      await onStageChange(leadId, newStage)
      toast({ title: "Stage updated", description: `Moved to ${STAGES.find(s => s.id === newStage)?.label}` })
    } catch {
      // Revert on error
      setOptimisticLeads(prev =>
        prev.map(l => l.id === leadId ? { ...l, crm_stage: lead.crm_stage } : l)
      )
      toast({ title: "Failed to update stage", variant: "destructive" })
    }
  }

  // Sync when props change
  if (JSON.stringify(leads.map(l => l.id + l.crm_stage)) !== JSON.stringify(optimisticLeads.map(l => l.id + l.crm_stage))) {
    setOptimisticLeads(leads)
  }

  return (
    <DndContext collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 h-full">
        {STAGES.map(stage => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            leads={optimisticLeads.filter(l => l.crm_stage === stage.id)}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead && <KanbanCard lead={activeLead} isDragging />}
      </DragOverlay>
    </DndContext>
  )
}
