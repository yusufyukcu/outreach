"use client"
import { KanbanColumn } from "./kanban-column"
import type { Lead, CRMStage } from "@/types"

const STAGES: { id: CRMStage; label: string; color: string }[] = [
  { id: "new",       label: "New",       color: "#94a3b8" },
  { id: "analyzed",  label: "Analyzed",  color: "#60a5fa" },
  { id: "contacted", label: "Contacted", color: "#fbbf24" },
  { id: "replied",   label: "Replied",   color: "#a78bfa" },
]

export function KanbanBoard({ leads }: { leads: Lead[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4 h-full">
      {STAGES.map(stage => (
        <KanbanColumn
          key={stage.id}
          stage={stage}
          leads={leads.filter(l => l.crm_stage === stage.id)}
        />
      ))}
    </div>
  )
}
