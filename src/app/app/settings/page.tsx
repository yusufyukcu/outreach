import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/layout/header"
import { SettingsClient } from "./settings-client"
import type { ServiceType } from "@/types"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, full_name, organizations(id, name, service_type, plan_tier)")
    .eq("id", user.id)
    .single() as {
      data: {
        org_id: string
        full_name: string | null
        organizations: {
          id: string
          name: string
          service_type: ServiceType
          plan_tier: string
        } | null
      } | null
    }

  return (
    <div className="flex flex-col overflow-auto">
      <Header title="Settings" subtitle="Manage your account and agency profile" />
      <div className="flex-1 overflow-auto p-6">
        <SettingsClient
          userId={user.id}
          email={user.email ?? ""}
          fullName={profile?.full_name ?? ""}
          orgId={profile?.org_id ?? ""}
          orgName={profile?.organizations?.name ?? ""}
          serviceType={(profile?.organizations?.service_type ?? "editing") as ServiceType}
          planTier={profile?.organizations?.plan_tier ?? "free"}
        />
      </div>
    </div>
  )
}
