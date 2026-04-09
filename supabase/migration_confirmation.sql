-- ── Match confirmation system ─────────────────────────────────────────────
-- Run this migration in the Supabase SQL Editor

-- Add confirmation/dispute columns to matches table
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS confirmed_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispute_reason  TEXT,
  ADD COLUMN IF NOT EXISTS expires_at      TIMESTAMPTZ;

-- Set expires_at for all existing pending matches (72h from creation)
UPDATE matches
SET expires_at = created_at + INTERVAL '72 hours'
WHERE expires_at IS NULL AND status = 'pending';

-- New status values: pending | confirmed | disputed | expired | rejected | approved(legacy)
-- 'approved' kept for admin-approved matches (legacy + dispute resolution)
-- 'confirmed' = peer-confirmed by opponent
-- 'disputed'  = opponent disputed, waiting for admin
-- 'expired'   = 72h timeout, no confirmation received

-- ── RLS Policies ──────────────────────────────────────────────────────────

-- Allow players involved in a match to update it (for confirmation/dispute)
-- This adds to any existing UPDATE policy
DROP POLICY IF EXISTS "Players can confirm or dispute matches" ON matches;
CREATE POLICY "Players can confirm or dispute matches"
  ON matches FOR UPDATE
  USING (
    auth.uid() IN (player1_id, player2_id, player3_id, player4_id)
  )
  WITH CHECK (
    auth.uid() IN (player1_id, player2_id, player3_id, player4_id)
  );
