import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/layout/header"
import { LeadRow } from "@/components/leads/lead-row"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Search, Plus } from "lucide-react"
import type { Lead, CRMStage } from "@/types"

const STAGE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All Leads" },
  { value: "new", label: "New" },
  { value: "analyzed", label: "Analyzed" },
  { value: "contacted", label: "Contacted" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "won", label: "Won" },
]

interface LeadsPageProps {
  searchParams: Promise<{ stage?: string; min_score?: string }>
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const { stage, min_score } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
  const orgId = profile?.org_id
  if (!orgId) return null

  let query = supabase
    .from("leads")
    .select("*, channel:channels(*), contact:contacts(*)")
    .eq("org_id", orgId)
    .order("lead_score", { ascending: false, nullsFirst: false })

  if (stage && stage !== "all") query = query.eq("crm_stage", stage as CRMStage)
  if (min_score) query = query.gte("lead_score", parseInt(min_score))

  const { data: leads } = await query
  const allLeads = (leads ?? []) as Lead[]

  // Count by stage for filter badges
  const { data: allForCounts } = await supabase
    .from("leads")
    .select("crm_stage, lead_score")
    .eq("org_id", orgId)

  const stageCounts = (allForCounts ?? []).reduce((acc, l) => {
    acc[l.crm_stage as CRMStage] = (acc[l.crm_stage as CRMStage] || 0) + 1
    return acc
  }, {} as Record<CRMStage, number>)

  const totalCount = allForCounts?.length ?? 0

  return (
    <div className="flex flex-col overflow-auto">
      <Header title="Lead Database" subtitle={`${totalCount} total leads in your pipeline`}>
        <Link href="/app/discover">
          <button className="inline-flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            Find Leads
          </button>
        </Link>
      </Header>

      <div className="flex-1 overflow-auto p-6">
        {/* Stage filter tabs */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          {STAGE_FILTERS.map(filter => {
            const count = filter.value === "all" ? totalCount : (stageCounts[filter.value as CRMStage] ?? 0)
            const isActive = (stage ?? "all") === filter.value
            return (
              <Link key={filter.value} href={filter.value === "all" ? "/app/leads" : `/app/leads?stage=${filter.value}`}>
                <button className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-primary text-white" : "bg-muted hover:bg-muted/70 text-muted-foreground"
                }`}>
                  {filter.label}
                  {count > 0 && (
                    <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full text-xs px-1 ${
                      isActive ? "bg-white/20 text-white" : "bg-background"
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              </Link>
            )
          })}

          <div className="ml-auto flex items-center gap-2">
            <Link href="/app/leads?min_score=85">
              <button className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                min_score === "85" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}>
                🔥 Hot Only (85+)
              </button>
            </Link>
          </div>
        </div>

        {/* Lead list */}
        <div className="rounded-xl border bg-white overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-2 bg-muted/50 border-b">
            <div className="w-9 shrink-0" />
            <div className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Channel</div>
            <div className="hidden sm:block w-20 text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Score</div>
            <div className="hidden md:block w-28 text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Stage</div>
            <div className="hidden lg:block w-24 text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Last Activity</div>
          </div>

          {allLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Search className="h-12 w-12 mb-3 opacity-20" />
              <p className="font-medium">No leads found</p>
              <p className="text-sm">
                {stage && stage !== "all"
                  ? "No leads in this stage"
                  : "Start discovering channels to fill your pipeline"}
              </p>
              {(!stage || stage === "all") && (
                <Link href="/app/discover" className="mt-3 text-sm text-primary hover:underline">
                  Discover channels →
                </Link>
              )}
            </div>
          ) : (
            allLeads.map(lead => <LeadRow key={lead.id} lead={lead} />)
          )}
        </div>
      </div>
    </div>
  )
}
