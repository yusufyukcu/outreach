"use client"
import { useState, useEffect } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { Header } from "@/components/layout/header"
import { KanbanBoard } from "@/components/pipeline/kanban-board"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import type { Lead, CRMStage } from "@/types"

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchLeads() {
    setLoading(true)
    try {
      const res = await fetch("/api/leads")
      const data = await res.json()
      setLeads(Array.isArray(data) ? data : [])
    } catch {
      toast({ title: "Failed to load pipeline", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLeads() }, [])

  async function handleStageChange(leadId: string, newStage: CRMStage) {
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crm_stage: newStage }),
    })
  }

  const totalValue = leads.reduce((sum, l) => sum + (l.deal_value_estimate ?? 0), 0)

  return (
    <div className="flex flex-col overflow-hidden h-full">
      <Header
        title="CRM Pipeline"
        subtitle={`${leads.length} leads · ${totalValue > 0 ? "$" + totalValue.toLocaleString() + " pipeline value" : "Drag cards between stages"}`}
      >
        <Button variant="outline" size="sm" onClick={fetchLeads} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </Header>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="font-medium">No leads in pipeline yet</p>
              <a href="/app/discover" className="text-sm text-primary hover:underline mt-1 block">
                Discover channels to get started →
              </a>
            </div>
          </div>
        ) : (
          <KanbanBoard leads={leads} onStageChange={handleStageChange} />
        )}
      </div>
      <Toaster />
    </div>
  )
}
