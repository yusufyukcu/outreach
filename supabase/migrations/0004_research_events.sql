-- ============================================================
-- Research Events — Migration 0004
-- Background data collection for the research article. The app only writes
-- these rows (append-only); nothing in the UI reads them.
-- Payloads hold derived scores, flags and public YouTube IDs only — no comment
-- text, transcripts, e-mail addresses or message bodies.
-- Run in the Supabase SQL Editor (idempotent — safe to re-run).
-- ============================================================

CREATE TABLE IF NOT EXISTS research_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,          -- discovery_run | lead_signals | email_generated
  channel_id  UUID REFERENCES channels(id) ON DELETE SET NULL,
  lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_events_org_type
  ON research_events(org_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_events_channel
  ON research_events(channel_id) WHERE channel_id IS NOT NULL;

ALTER TABLE research_events ENABLE ROW LEVEL SECURITY;

-- Append-only for app users: insert + read own org, no update/delete.
DROP POLICY IF EXISTS "Org members can insert research_events" ON research_events;
CREATE POLICY "Org members can insert research_events"
  ON research_events FOR INSERT
  WITH CHECK (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Org members can read research_events" ON research_events;
CREATE POLICY "Org members can read research_events"
  ON research_events FOR SELECT
  USING (org_id = get_user_org_id());
