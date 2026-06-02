-- ============================================================
-- YouTube Lead Operator — Complete V1 Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUMS ───────────────────────────────────────────────────────────────────

CREATE TYPE crm_stage AS ENUM (
  'new', 'analyzed', 'contacted', 'replied',
  'interested', 'meeting_scheduled', 'proposal_sent', 'won', 'lost'
);

CREATE TYPE service_type AS ENUM (
  'editing', 'thumbnails', 'scripting', 'growth', 'custom'
);

CREATE TYPE outreach_channel AS ENUM (
  'email', 'twitter', 'instagram', 'linkedin'
);

CREATE TYPE message_status AS ENUM (
  'pending', 'sent', 'delivered', 'opened',
  'clicked', 'replied', 'bounced', 'failed'
);

CREATE TYPE activity_type AS ENUM (
  'lead_created', 'stage_changed', 'email_sent', 'email_opened',
  'email_replied', 'note_added', 'score_updated', 'contact_found', 'analyzed'
);

CREATE TYPE plan_tier AS ENUM (
  'free', 'starter', 'growth', 'agency', 'enterprise'
);

CREATE TYPE user_role AS ENUM (
  'owner', 'admin', 'member', 'viewer'
);

-- ─── ORGANIZATIONS ────────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  plan_tier     plan_tier NOT NULL DEFAULT 'free',
  service_type  service_type NOT NULL DEFAULT 'editing',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PROFILES ─────────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id       UUID REFERENCES organizations(id) ON DELETE SET NULL,
  email        TEXT NOT NULL,
  full_name    TEXT,
  avatar_url   TEXT,
  role         user_role NOT NULL DEFAULT 'owner',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CHANNELS ─────────────────────────────────────────────────────────────────

CREATE TABLE channels (
  id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  youtube_channel_id            TEXT NOT NULL UNIQUE,
  handle                        TEXT,
  name                          TEXT NOT NULL,
  description                   TEXT,
  thumbnail_url                 TEXT,
  country                       TEXT,
  language                      TEXT,
  niche_primary                 TEXT,
  niche_secondary               TEXT,
  subscriber_count              BIGINT NOT NULL DEFAULT 0,
  total_view_count              BIGINT NOT NULL DEFAULT 0,
  video_count                   INTEGER NOT NULL DEFAULT 0,
  avg_views_30d                 INTEGER,
  upload_frequency_per_week     NUMERIC(4,2),
  last_upload_at                TIMESTAMPTZ,
  monetization_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  sponsorship_detected          BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_monthly_revenue_min INTEGER,
  estimated_monthly_revenue_max INTEGER,
  outsourcing_likelihood_score  SMALLINT CHECK (outsourcing_likelihood_score BETWEEN 0 AND 100),
  editing_quality_score         SMALLINT CHECK (editing_quality_score BETWEEN 0 AND 100),
  thumbnail_quality_score       SMALLINT CHECK (thumbnail_quality_score BETWEEN 0 AND 100),
  growth_trend_30d              NUMERIC(6,2),
  analysis_summary              TEXT,
  last_analyzed_at              TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channels_youtube_id ON channels(youtube_channel_id);
CREATE INDEX idx_channels_niche ON channels(niche_primary);
CREATE INDEX idx_channels_subscribers ON channels(subscriber_count DESC);

-- ─── LEADS ────────────────────────────────────────────────────────────────────

CREATE TABLE leads (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id          UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  assigned_to         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  crm_stage           crm_stage NOT NULL DEFAULT 'new',
  lead_score          SMALLINT CHECK (lead_score BETWEEN 0 AND 100),
  score_breakdown     JSONB,
  deal_value_estimate INTEGER,
  source              TEXT,
  tags                TEXT[] NOT NULL DEFAULT '{}',
  notes               TEXT,
  last_contacted_at   TIMESTAMPTZ,
  next_follow_up_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, channel_id)
);

CREATE INDEX idx_leads_org_stage ON leads(org_id, crm_stage);
CREATE INDEX idx_leads_org_score ON leads(org_id, lead_score DESC NULLS LAST);
CREATE INDEX idx_leads_updated ON leads(updated_at DESC);

-- ─── CONTACTS ─────────────────────────────────────────────────────────────────

CREATE TABLE contacts (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id             UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE UNIQUE,
  email                  TEXT,
  email_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  email_confidence_score SMALLINT NOT NULL DEFAULT 0,
  twitter_handle         TEXT,
  instagram_handle       TEXT,
  linkedin_url           TEXT,
  website_url            TEXT,
  name                   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── OUTREACH MESSAGES ────────────────────────────────────────────────────────

CREATE TABLE outreach_messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel       outreach_channel NOT NULL DEFAULT 'email',
  subject       TEXT,
  body          TEXT NOT NULL,
  status        message_status NOT NULL DEFAULT 'pending',
  sent_at       TIMESTAMPTZ,
  opened_at     TIMESTAMPTZ,
  replied_at    TIMESTAMPTZ,
  ai_generated  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_lead ON outreach_messages(lead_id);
CREATE INDEX idx_messages_org_status ON outreach_messages(org_id, status);

-- ─── ACTIVITIES ───────────────────────────────────────────────────────────────

CREATE TABLE activities (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id    UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type       activity_type NOT NULL,
  metadata   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_lead ON activities(lead_id, created_at DESC);

-- ─── WORK EXPERIENCES ─────────────────────────────────────────────────────────
-- Channels the user/agency has worked with. Used as social proof in outreach.

CREATE TABLE work_experiences (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  channel_name TEXT NOT NULL,
  role         TEXT,
  result       TEXT,
  channel_url  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_work_experiences_org ON work_experiences(org_id, created_at DESC);

-- ─── GMAIL ACCOUNTS ───────────────────────────────────────────────────────────
-- Per-user OAuth tokens for sending email directly via the Gmail API.

CREATE TABLE gmail_accounts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token  TEXT,
  expiry        TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── FUNCTIONS & TRIGGERS ─────────────────────────────────────────────────────

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Create a new organization for the user
  INSERT INTO organizations (name, plan_tier, service_type)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'org_name', split_part(NEW.email, '@', 1) || '''s Agency'),
    'free',
    COALESCE((NEW.raw_user_meta_data->>'service_type')::service_type, 'editing')
  )
  RETURNING id INTO new_org_id;

  -- Create their profile
  INSERT INTO profiles (id, org_id, email, full_name, role)
  VALUES (
    NEW.id,
    new_org_id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    'owner'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's org_id
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Organizations: only members can see their own org
CREATE POLICY "Users can view their own org"
  ON organizations FOR SELECT
  USING (id = get_user_org_id());

CREATE POLICY "Owners can update their org"
  ON organizations FOR UPDATE
  USING (id = get_user_org_id());

-- Profiles: users in same org can view each other
CREATE POLICY "Org members can view profiles"
  ON profiles FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Channels: all authenticated users can read (public data)
CREATE POLICY "Authenticated users can read channels"
  ON channels FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Authenticated users can insert channels"
  ON channels FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY "Authenticated users can update channels"
  ON channels FOR UPDATE
  TO authenticated
  USING (TRUE);

-- Leads: org-scoped
CREATE POLICY "Org members can CRUD leads"
  ON leads FOR ALL
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

-- Contacts: org-scoped via lead
CREATE POLICY "Org members can read contacts"
  ON contacts FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Org members can write contacts"
  ON contacts FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- Outreach messages: org-scoped
CREATE POLICY "Org members can CRUD messages"
  ON outreach_messages FOR ALL
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

-- Activities: org-scoped
CREATE POLICY "Org members can CRUD activities"
  ON activities FOR ALL
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

-- Work experiences: org-scoped
CREATE POLICY "Org members can CRUD work experiences"
  ON work_experiences FOR ALL
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

-- Gmail accounts: strictly per-user
CREATE POLICY "Users manage their own gmail account"
  ON gmail_accounts FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── SEED DATA (NICHES) ───────────────────────────────────────────────────────

-- Demo channels for testing (optional — remove in production)
INSERT INTO channels (
  youtube_channel_id, name, handle, thumbnail_url, niche_primary,
  subscriber_count, total_view_count, video_count, avg_views_30d,
  upload_frequency_per_week, monetization_enabled, sponsorship_detected,
  estimated_monthly_revenue_min, estimated_monthly_revenue_max,
  outsourcing_likelihood_score, editing_quality_score, thumbnail_quality_score,
  growth_trend_30d, analysis_summary, last_analyzed_at
) VALUES
(
  'UCdemo1', 'TechReviews Hub', '@techreviewshub',
  'https://yt3.googleusercontent.com/placeholder1',
  'Technology', 125000, 8500000, 340, 85000, 4,
  TRUE, TRUE, 8000, 15000, 72, 45, 38,
  12.5,
  'Fast-growing tech channel with high upload frequency. Editing quality is inconsistent — strong candidate for editing services. Revenue from sponsorships suggests healthy budget.',
  NOW()
),
(
  'UCdemo2', 'Finance Freedom', '@financefreedom',
  'https://yt3.googleusercontent.com/placeholder2',
  'Personal Finance', 67000, 3200000, 180, 42000, 2,
  TRUE, FALSE, 3000, 6000, 55, 62, 71,
  8.2,
  'Steady personal finance channel. Good engagement rate. Thumbnail quality above average. Potential for scripting services given educational format.',
  NOW()
),
(
  'UCdemo3', 'Fitness With Jake', '@fitnessjake',
  'https://yt3.googleusercontent.com/placeholder3',
  'Health & Fitness', 38000, 1800000, 95, 28000, 3,
  FALSE, FALSE, 1500, 3500, 35, 40, 32,
  18.7,
  'Rapidly growing fitness channel with poor production quality. No editing credits found. High growth velocity suggests the creator needs production support urgently.',
  NOW()
),
(
  'UCdemo4', 'Cooking Mastery', '@cookingmastery',
  'https://yt3.googleusercontent.com/placeholder4',
  'Food & Cooking', 215000, 12000000, 420, 95000, 5,
  TRUE, TRUE, 12000, 22000, 85, 52, 44,
  6.1,
  'High-volume cooking channel with signs of team production. Multiple video styles detected suggesting outsourced editing. Revenue signals indicate strong budget.',
  NOW()
),
(
  'UCdemo5', 'Gaming Galaxy', '@gaminggalaxy',
  'https://yt3.googleusercontent.com/placeholder5',
  'Gaming', 89000, 5100000, 280, 63000, 6,
  TRUE, FALSE, 5000, 10000, 45, 38, 29,
  22.3,
  'High-growth gaming channel with very poor thumbnail quality compared to channel size. Strong opportunity for thumbnail redesign services.',
  NOW()
);
