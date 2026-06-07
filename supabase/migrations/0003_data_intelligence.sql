-- ============================================================
-- Data Intelligence Layer — Migration 0003
-- Run in the Supabase SQL Editor (idempotent — safe to re-run).
-- ============================================================

-- ─── AUTOLEAD SESSIONS ───────────────────────────────────────────────────────
-- Tracks each AutoLead run with its configuration and outcome.

CREATE TABLE IF NOT EXISTS autolead_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  niche         TEXT,
  faceless_mode BOOLEAN NOT NULL DEFAULT FALSE,
  min_subs      INTEGER,
  max_subs      INTEGER,
  auto_send     BOOLEAN NOT NULL DEFAULT FALSE,
  leads_found   INTEGER NOT NULL DEFAULT 0,
  emails_sent   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_autolead_sessions_org ON autolead_sessions(org_id, started_at DESC);

ALTER TABLE autolead_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can CRUD autolead_sessions" ON autolead_sessions;
CREATE POLICY "Org members can CRUD autolead_sessions"
  ON autolead_sessions FOR ALL
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

-- ─── LEADS — discovery metadata ──────────────────────────────────────────────
-- Columns that record how / when a lead was found by AutoLead.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS discovery_keyword   TEXT,
  ADD COLUMN IF NOT EXISTS discovery_target    TEXT,
  ADD COLUMN IF NOT EXISTS autolead_session_id UUID REFERENCES autolead_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_found         BOOLEAN,
  ADD COLUMN IF NOT EXISTS email_source        TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_keyword ON leads(discovery_keyword)
  WHERE discovery_keyword IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_session ON leads(autolead_session_id)
  WHERE autolead_session_id IS NOT NULL;

-- ─── OUTREACH MESSAGES — Gmail tracking + intelligence columns ───────────────
-- gmail_* columns may already exist from a previous session; IF NOT EXISTS is safe.

ALTER TABLE outreach_messages
  ADD COLUMN IF NOT EXISTS gmail_message_id    TEXT,
  ADD COLUMN IF NOT EXISTS gmail_thread_id     TEXT,
  ADD COLUMN IF NOT EXISTS reply_from          TEXT,
  ADD COLUMN IF NOT EXISTS reply_body          TEXT,
  ADD COLUMN IF NOT EXISTS email_variant       TEXT,
  ADD COLUMN IF NOT EXISTS reply_classification TEXT,
  ADD COLUMN IF NOT EXISTS response_time_hours  NUMERIC(8,2);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON outreach_messages(gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_classification ON outreach_messages(reply_classification)
  WHERE reply_classification IS NOT NULL;

-- ─── CONVERSION EVENTS ───────────────────────────────────────────────────────
-- Explicit funnel events with timestamps: sample_sent, meeting_booked, client_won, etc.

CREATE TABLE IF NOT EXISTS conversion_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes       TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_conversion_events_org  ON conversion_events(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversion_events_lead ON conversion_events(lead_id);

ALTER TABLE conversion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can CRUD conversion_events" ON conversion_events;
CREATE POLICY "Org members can CRUD conversion_events"
  ON conversion_events FOR ALL
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

-- ─── EDITORIAL FEEDBACK ──────────────────────────────────────────────────────
-- What prospects actually ask for (motion_graphics, pacing, shorts_editing, etc.)

CREATE TABLE IF NOT EXISTS editorial_feedback (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  feedback_tags TEXT[] NOT NULL DEFAULT '{}',
  custom_tags   TEXT[] NOT NULL DEFAULT '{}',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_editorial_feedback_org  ON editorial_feedback(org_id);
CREATE INDEX IF NOT EXISTS idx_editorial_feedback_lead ON editorial_feedback(lead_id);

ALTER TABLE editorial_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can CRUD editorial_feedback" ON editorial_feedback;
CREATE POLICY "Org members can CRUD editorial_feedback"
  ON editorial_feedback FOR ALL
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());
