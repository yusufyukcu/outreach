import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/layout/header"
import { LeadsClient } from "./leads-client"
import Link from "next/link"
import { Plus } from "lucide-react"
import type { ServiceType, Lead } from "@/types"

export const dynamic = "force-dynamic"

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
  const orgId = profile?.org_id
  if (!orgId) return null

  // NOTE: `contacts` has no direct FK to `leads` (both reference `channels`),
  // so we cannot embed `contact:contacts(*)` directly off leads — PostgREST
  // errors and returns null, leaving the list empty. Embed only the guaranteed
  // leads→channels relationship, then fetch contacts separately and merge.
  const [{ data: org }, { data: leads, error: leadsError }] = await Promise.all([
    supabase.from("organizations").select("service_type").eq("id", orgId).single(),
    supabase
      .from("leads")
      .select("*, channel:channels(*)")
      .eq("org_id", orgId)
      .order("lead_score", { ascending: false, nullsFirst: false }),
  ])

  if (leadsError) console.error("Failed to load leads:", leadsError)

  const leadRows = leads ?? []
  const channelIds = [...new Set(leadRows.map((l) => l.channel_id).filter(Boolean))]

  let contactsByChannel: Record<string, unknown> = {}
  if (channelIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("*")
      .in("channel_id", channelIds)
    contactsByChannel = Object.fromEntries((contacts ?? []).map((c) => [c.channel_id, c]))
  }

  const leadsWithContacts = leadRows.map((l) => ({
    ...l,
    contact: contactsByChannel[l.channel_id] ?? null,
  }))

  const serviceType = (org?.service_type ?? "editing") as ServiceType

  return (
    <div className="flex flex-col overflow-auto">
      <Header title="Lead Database" subtitle="Your lead pipeline">
        <Link href="/app/discover">
          <button
            className="btn-glow inline-flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: "linear-gradient(135deg, hsl(243 75% 59%), hsl(280 75% 60%))" }}
          >
            <Plus className="h-4 w-4" />
            Find Leads
          </button>
        </Link>
      </Header>

      <div className="flex-1 overflow-auto p-6">
        <LeadsClient serviceType={serviceType} initialLeads={leadsWithContacts as Lead[]} />
      </div>
    </div>
  )
}
