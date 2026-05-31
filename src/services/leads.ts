import { createClient } from "@/lib/supabase/client"
import type { Lead, CRMStage, ScoreBreakdown, Activity } from "@/types"

export async function getLeads(orgId: string, filters?: {
  stage?: CRMStage
  minScore?: number
  search?: string
}) {
  const supabase = createClient()
  let query = supabase
    .from("leads")
    .select(`
      *,
      channel:channels(*),
      contact:contacts(*),
      assignee:profiles(id, full_name, avatar_url)
    `)
    .eq("org_id", orgId)
    .order("lead_score", { ascending: false, nullsFirst: false })

  if (filters?.stage) query = query.eq("crm_stage", filters.stage)
  if (filters?.minScore) query = query.gte("lead_score", filters.minScore)

  const { data, error } = await query
  if (error) throw error
  return data as Lead[]
}

export async function getLead(leadId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("leads")
    .select(`
      *,
      channel:channels(*),
      contact:contacts(*),
      assignee:profiles(id, full_name, avatar_url)
    `)
    .eq("id", leadId)
    .single()
  if (error) throw error
  return data as Lead
}

export async function updateLeadStage(leadId: string, stage: CRMStage, orgId: string) {
  const supabase = createClient()

  const { data: lead } = await supabase.from("leads").select("crm_stage").eq("id", leadId).single()

  const { error } = await supabase
    .from("leads")
    .update({ crm_stage: stage })
    .eq("id", leadId)

  if (error) throw error

  // Log activity
  await supabase.from("activities").insert({
    org_id: orgId,
    lead_id: leadId,
    type: "stage_changed",
    metadata: { from: lead?.crm_stage, to: stage },
  })
}

export async function updateLeadScore(leadId: string, score: number, breakdown: ScoreBreakdown) {
  const supabase = createClient()
  const { error } = await supabase
    .from("leads")
    .update({ lead_score: score, score_breakdown: breakdown })
    .eq("id", leadId)
  if (error) throw error
}

export async function addLeadNote(leadId: string, note: string, orgId: string) {
  const supabase = createClient()
  const { error: updateError } = await supabase
    .from("leads")
    .update({ notes: note })
    .eq("id", leadId)
  if (updateError) throw updateError

  await supabase.from("activities").insert({
    org_id: orgId,
    lead_id: leadId,
    type: "note_added",
    metadata: { note },
  })
}

export async function getLeadActivities(leadId: string): Promise<Activity[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("activities")
    .select("*, user:profiles(id, full_name, avatar_url)")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return data as Activity[]
}

export async function addChannelAsLead(channelId: string, orgId: string) {
  const supabase = createClient()

  // Check for existing
  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("org_id", orgId)
    .eq("channel_id", channelId)
    .single()

  if (existing) return existing

  const { data, error } = await supabase
    .from("leads")
    .insert({ org_id: orgId, channel_id: channelId, crm_stage: "new", source: "manual" })
    .select()
    .single()
  if (error) throw error

  await supabase.from("activities").insert({
    org_id: orgId,
    lead_id: data.id,
    type: "lead_created",
    metadata: {},
  })

  return data
}

export async function getDashboardStats(orgId: string) {
  const supabase = createClient()
  const { data: leads, error } = await supabase
    .from("leads")
    .select("crm_stage, lead_score, deal_value_estimate, created_at, last_contacted_at")
    .eq("org_id", orgId)

  if (error) throw error

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const stageCounts = leads.reduce((acc, l) => {
    acc[l.crm_stage as CRMStage] = (acc[l.crm_stage as CRMStage] || 0) + 1
    return acc
  }, {} as Record<CRMStage, number>)

  return {
    total_leads: leads.length,
    hot_leads: leads.filter(l => (l.lead_score ?? 0) >= 85).length,
    contacted_this_week: leads.filter(l =>
      l.last_contacted_at && new Date(l.last_contacted_at) > weekAgo
    ).length,
    pipeline_value: leads.reduce((sum, l) => sum + (l.deal_value_estimate ?? 0), 0),
    won_this_month: leads.filter(l =>
      l.crm_stage === "won" && new Date(l.created_at) > monthAgo
    ).length,
    stage_counts: stageCounts,
  }
}
