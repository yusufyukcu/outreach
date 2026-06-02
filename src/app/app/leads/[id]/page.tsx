import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { LeadDetailClient } from "./lead-detail-client"
import type { Lead, Activity } from "@/types"

interface LeadDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, organizations(service_type)")
    .eq("id", user.id)
    .single() as {
      data: { org_id: string; organizations: { service_type: string } | null } | null
    }

  // `contacts` has no direct FK to `leads`, so embed only channels and fetch
  // the contact separately by channel_id (see leads list page for details).
  const { data: lead, error } = await supabase
    .from("leads")
    .select("*, channel:channels(*)")
    .eq("id", id)
    .single()

  if (error || !lead) notFound()

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("channel_id", lead.channel_id)
    .maybeSingle()
  ;(lead as { contact?: unknown }).contact = contact ?? null

  const { data: activities } = await supabase
    .from("activities")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(20)

  const { data: messages } = await supabase
    .from("outreach_messages")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })

  return (
    <LeadDetailClient
      lead={lead as Lead}
      activities={(activities ?? []) as Activity[]}
      messages={messages ?? []}
      serviceType={(profile?.organizations?.service_type ?? "editing") as any}
      orgId={profile?.org_id ?? ""}
    />
  )
}
