-- ============================================================
-- Editing Analysis — Migration 0005
-- Stores the Gemini review of each channel's latest long-form video:
-- the 0-100 score (editing_quality_score, already in schema.sql — added
-- here defensively) and the full review with per-dimension levels,
-- evidence, summary and suggested improvements (editing_analysis).
-- Run in the Supabase SQL Editor (idempotent — safe to re-run).
-- ============================================================

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS editing_quality_score SMALLINT CHECK (editing_quality_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS editing_analysis      JSONB;
