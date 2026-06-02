-- ============================================================
-- Gmail Accounts — per-user OAuth tokens for sending email
-- directly from the app via the Gmail API.
--
-- Safe to run on an existing database (idempotent).
-- Run in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS gmail_accounts (
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

ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;

-- Strictly per-user: a user can only read/write their own Gmail connection.
DROP POLICY IF EXISTS "Users manage their own gmail account" ON gmail_accounts;
CREATE POLICY "Users manage their own gmail account"
  ON gmail_accounts FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
