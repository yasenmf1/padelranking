-- Migration: Add doubles (2v2) support to matches table
-- Run this in the Supabase SQL editor if the matches table already exists.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS player3_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS player4_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS player3_rating_before INTEGER,
  ADD COLUMN IF NOT EXISTS player4_rating_before INTEGER,
  ADD COLUMN IF NOT EXISTS player3_rating_after INTEGER,
  ADD COLUMN IF NOT EXISTS player4_rating_after INTEGER;

-- Index for quick lookup by team 2 players
CREATE INDEX IF NOT EXISTS idx_matches_player3 ON matches(player3_id);
CREATE INDEX IF NOT EXISTS idx_matches_player4 ON matches(player4_id);
