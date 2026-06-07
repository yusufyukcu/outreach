"use client"
import { useState, useEffect } from "react"
import { RefreshCw, GitBranch, Sparkles } from "lucide-react"
import { Header } from "@/components/layout/header"
import { KanbanBoard } from "@/components/pipeline/kanban-board"
import { toast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import type { Lead } from "@/types"

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

  return (
    <div className="flex flex-col overflow-hidden h-full">
      <Header
        title="Pipeline"
        subtitle={`${leads.length} leads — stages update automatically`}
      >
        <button
          onClick={fetchLeads}
          disabled={loading}
          className="h-9 w-9 flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm hover:shadow-md transition-all disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </Header>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="relative w-48 h-32">
              <div className="absolute top-0 left-8 w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 opacity-80 animate-block-1 shadow-lg" />
              <div className="absolute top-10 right-4 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-400 opacity-70 animate-block-2 shadow-md" />
              <div className="absolute bottom-0 left-16 w-8 h-8 rounded-xl bg-gradient-to-BR from-rose-500 to-orange-400 opacity-70 animate-block-3 shadow-md" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Loading pipeline...</p>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="rounded-2xl p-10 text-center max-w-sm mx-auto" style={{ border: "2px dashed rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.04)" }}>
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <GitBranch className="h-7 w-7 text-white" />
              </div>
              <h3 className="font-bold text-base mb-1 text-foreground">No leads yet</h3>
              <p className="text-sm text-muted-foreground mb-5">Run AutoLead or discover channels to populate the pipeline.</p>
              <a
                href="/app/autolead"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm transition-all"
                style={{ background: "linear-gradient(135deg, hsl(243 75% 55%), hsl(280 80% 58%))" }}
              >
                <Sparkles className="h-4 w-4" />
                Start AutoLead
              </a>
            </div>
          </div>
        ) : (
          <KanbanBoard leads={leads} />
        )}
      </div>
      <Toaster />
    </div>
  )
}
