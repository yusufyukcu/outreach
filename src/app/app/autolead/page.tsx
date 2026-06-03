import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/layout/header"
import { AutoLeadClient } from "./autolead-client"
import type { ServiceType } from "@/types"

export const dynamic = "force-dynamic"

export default async function AutoLeadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, organizations(name, service_type, niche)")
    .eq("id", user.id)
    .single() as {
      data: {
        org_id: string | null
        organizations: { name: string | null; service_type: string | null; niche: string | null } | null
      } | null
    }

  const serviceType = (profile?.organizations?.service_type ?? "editing") as ServiceType
  const orgName = profile?.organizations?.name ?? ""
  const orgNiche = profile?.organizations?.niche ?? ""

  return (
    <div className="flex flex-col overflow-auto h-full">
      <Header
        title="AutoLead"
        subtitle="Automatically discovers and contacts YouTube channels"
      />
      <div className="flex-1 overflow-auto p-6">
        <AutoLeadClient
          serviceType={serviceType}
          orgName={orgName}
          orgNiche={orgNiche}
        />
      </div>
    </div>
  )
}
