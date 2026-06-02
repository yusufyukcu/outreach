// ─── Enums ────────────────────────────────────────────────────────────────────

// ─── Lead Finder / Quality Analysis ─────────────────────────────────────────────

export interface RecentVideoMetrics {
  last_upload_at: string | null
  days_since_upload: number | null
  avg_recent_views: number
  median_recent_views: number
  upload_frequency_per_week: number
  avg_video_length_sec: number
  long_form_pct: number          // % of recent videos longer than 8 min
  shorts_pct: number             // % of recent videos that are Shorts (<= 60s)
  engagement_ratio: number       // avg_recent_views / subscriber_count
  recent_video_count: number     // how many recent videos we actually analyzed
  recent_titles: string[]
  upload_trend: "growing" | "declining" | "stable" | "unknown"
  upload_trend_pct: number       // e.g. +45 or -30 (view change %)
}

export interface QualityBreakdown {
  activity: number               // 0-25
  recent_views: number           // 0-20
  long_form: number              // 0-15
  niche_match: number            // 0-15
  business_potential: number     // 0-15
  contact_availability: number   // 0-10
  total: number                  // 0-100
}

export interface DiscoveredLead {
  // identity (post-upsert id is filled in)
  id?: string
  youtube_channel_id: string
  name: string
  handle: string | null
  description: string | null
  thumbnail_url: string | null
  country: string | null
  language: string | null
  niche_primary: string | null
  subscriber_count: number
  total_view_count: number
  video_count: number
  // analysis
  metrics: RecentVideoMetrics
  business_email: string | null
  has_links: boolean
  sponsorship_detected: boolean
  // scoring
  score: number
  quality_breakdown: QualityBreakdown
  badges: string[]
  warnings: string[]
  reasoning: string
  // semantic relevance
  relevance_score: number        // 0-100, content-based
  relevance_explanation: string
  expanded_concepts?: string[]   // concepts used for this search
  // faceless detection
  faceless_score: number         // 0-100, likelihood of being a faceless/stock channel
  faceless_signals: string[]     // human-readable signals that triggered the score
  // new quality signals
  thumbnail_quality: { score: number; signal: string; needs_improvement: boolean } | null
  comment_signals: { needs_help: boolean; signal: string; score: number } | null
  won_similarity: number | null
}

export type CRMStage =
  | "new"
  | "analyzed"
  | "contacted"
  | "replied"
  | "interested"
  | "meeting_scheduled"
  | "proposal_sent"
  | "won"
  | "lost"

export type ServiceType =
  | "editing"
  | "thumbnails"
  | "scripting"
  | "growth"
  | "custom"

export type OutreachChannel = "email" | "twitter" | "instagram" | "linkedin"

export type MessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "replied"
  | "bounced"
  | "failed"

export type ActivityType =
  | "lead_created"
  | "stage_changed"
  | "email_sent"
  | "email_opened"
  | "email_replied"
  | "note_added"
  | "score_updated"
  | "contact_found"
  | "analyzed"

// ─── Database Types ────────────────────────────────────────────────────────────

export interface Organization {
  id: string
  name: string
  plan_tier: "free" | "starter" | "growth" | "agency" | "enterprise"
  service_type: ServiceType
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  org_id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: "owner" | "admin" | "member" | "viewer"
  created_at: string
}

export interface Channel {
  id: string
  youtube_channel_id: string
  handle: string | null
  name: string
  description: string | null
  thumbnail_url: string | null
  country: string | null
  language: string | null
  niche_primary: string | null
  niche_secondary: string | null
  subscriber_count: number
  total_view_count: number
  video_count: number
  avg_views_30d: number | null
  upload_frequency_per_week: number | null
  last_upload_at: string | null
  monetization_enabled: boolean
  sponsorship_detected: boolean
  estimated_monthly_revenue_min: number | null
  estimated_monthly_revenue_max: number | null
  outsourcing_likelihood_score: number | null
  editing_quality_score: number | null
  thumbnail_quality_score: number | null
  growth_trend_30d: number | null
  analysis_summary: string | null
  last_analyzed_at: string | null
  created_at: string
}

export interface Lead {
  id: string
  org_id: string
  channel_id: string
  assigned_to: string | null
  crm_stage: CRMStage
  lead_score: number | null
  score_breakdown: ScoreBreakdown | null
  deal_value_estimate: number | null
  source: string | null
  tags: string[]
  notes: string | null
  last_contacted_at: string | null
  next_follow_up_at: string | null
  created_at: string
  updated_at: string
  // Joined
  channel?: Channel
  contact?: Contact
  assignee?: Profile
}

export interface ScoreBreakdown {
  growth_velocity: number        // 0-20
  upload_frequency: number       // 0-10
  revenue_potential: number      // 0-15
  subscriber_sweet_spot: number  // 0-10
  outsourcing_likelihood: number // 0-15
  quality_gap: number            // 0-15
  engagement_quality: number     // 0-10
  content_consistency: number    // 0-5
  total: number                  // 0-100
}

export interface Contact {
  id: string
  channel_id: string
  email: string | null
  email_verified: boolean
  email_confidence_score: number
  twitter_handle: string | null
  instagram_handle: string | null
  linkedin_url: string | null
  website_url: string | null
  name: string | null
  created_at: string
  updated_at: string
}

export interface WorkExperience {
  id: string
  org_id: string
  user_id: string | null
  channel_name: string
  role: string | null
  result: string | null
  channel_url: string | null
  created_at: string
}

export interface OutreachMessage {
  id: string
  org_id: string
  lead_id: string
  channel: OutreachChannel
  subject: string | null
  body: string
  status: MessageStatus
  sent_at: string | null
  opened_at: string | null
  replied_at: string | null
  ai_generated: boolean
  created_at: string
  // Joined
  lead?: Lead
}

export interface Activity {
  id: string
  org_id: string
  lead_id: string
  user_id: string | null
  type: ActivityType
  metadata: Record<string, unknown>
  created_at: string
  // Joined
  user?: Profile
}

// ─── API / Form Types ──────────────────────────────────────────────────────────

export interface DiscoverChannelsInput {
  keywords: string[]
  niche: string
  min_subscribers: number
  max_subscribers: number
  service_type: ServiceType
}

export interface GenerateOutreachInput {
  lead_id: string
  service_type: ServiceType
  tone: "professional" | "casual" | "direct"
  channel: OutreachChannel
  agency_name: string
  agency_value_prop: string
}

export interface DashboardStats {
  total_leads: number
  hot_leads: number
  contacted_this_week: number
  replies_this_week: number
  pipeline_value: number
  won_this_month: number
  stage_counts: Record<CRMStage, number>
}

// ─── Supabase Database ─────────────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      organizations: { Row: Organization; Insert: Omit<Organization, "id" | "created_at" | "updated_at">; Update: Partial<Organization> }
      profiles: { Row: Profile; Insert: Omit<Profile, "created_at">; Update: Partial<Profile> }
      channels: { Row: Channel; Insert: Omit<Channel, "id" | "created_at">; Update: Partial<Channel> }
      leads: { Row: Lead; Insert: Omit<Lead, "id" | "created_at" | "updated_at">; Update: Partial<Lead> }
      contacts: { Row: Contact; Insert: Omit<Contact, "id" | "created_at" | "updated_at">; Update: Partial<Contact> }
      outreach_messages: { Row: OutreachMessage; Insert: Omit<OutreachMessage, "id" | "created_at">; Update: Partial<OutreachMessage> }
      activities: { Row: Activity; Insert: Omit<Activity, "id" | "created_at">; Update: Partial<Activity> }
    }
  }
}
