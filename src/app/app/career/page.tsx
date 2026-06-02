import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/layout/header"
import { CareerClient } from "./career-client"
import type { WorkExperience } from "@/types"

export const dynamic = "force-dynamic"

export default async function CareerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
  const orgId = profile?.org_id

  let experiences: WorkExperience[] = []
  if (orgId) {
    // Table may not exist yet (migration not run) — degrade gracefully.
    const { data } = await supabase
      .from("work_experiences")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
    experiences = (data ?? []) as WorkExperience[]
  }

  return (
    <div className="flex flex-col overflow-auto">
      <Header title="My Career" subtitle="Channels you've worked with — used as social proof in your outreach" />
      <div className="flex-1 overflow-auto p-6">
        <CareerClient initialExperiences={experiences} />
      </div>
    </div>
  )
}
