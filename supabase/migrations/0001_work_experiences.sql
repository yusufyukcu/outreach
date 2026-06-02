-- ============================================================
-- Work Experiences — channels the user/agency has worked with.
-- Surfaced as social proof when generating outreach emails.
--
-- Safe to run on an existing database (idempotent).
-- Run in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS work_experiences (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  channel_name TEXT NOT NULL,
  role         TEXT,
  result       TEXT,
  channel_url  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_experiences_org
  ON work_experiences(org_id, created_at DESC);

ALTER TABLE work_experiences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can CRUD work experiences" ON work_experiences;
CREATE POLICY "Org members can CRUD work experiences"
  ON work_experiences FOR ALL
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());
