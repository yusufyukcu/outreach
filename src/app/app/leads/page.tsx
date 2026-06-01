import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/layout/header"
import { LeadsClient } from "./leads-client"
import Link from "next/link"
import { Plus } from "lucide-react"
import type { Lead, ServiceType } from "@/types"

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
  const orgId = profile?.org_id
  if (!orgId) return null

  // Fetch org service type for outreach generation
  const { data: org } = await supabase.from("organizations").select("service_type").eq("id", orgId).single()
  const serviceType = (org?.service_type ?? "editing") as ServiceType

  const { data: leads } = await supabase
    .from("leads")
    .select("*, channel:channels(*), contact:contacts(*)")
    .eq("org_id", orgId)
    .order("lead_score", { ascending: false, nullsFirst: false })

  const allLeads = (leads ?? []) as Lead[]

  return (
    <div className="flex flex-col overflow-auto">
      <Header title="Lead Database" subtitle={`${allLeads.length} total leads in your pipeline`}>
        <Link href="/app/discover">
          <button className="inline-flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            Find Leads
          </button>
        </Link>
      </Header>

      <div className="flex-1 overflow-auto p-6">
        <LeadsClient leads={allLeads} serviceType={serviceType} />
      </div>
    </div>
  )
}
