-- Migration: Add tactical self-assessment fields to profiles
-- Run in Supabase SQL editor if the table already exists.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS self_assessment_score INTEGER,
  ADD COLUMN IF NOT EXISTS self_assessment_data JSONB;
