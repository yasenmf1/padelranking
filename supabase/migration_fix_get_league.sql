-- ── Fix get_league() encoding ─────────────────────────────────────────────
-- Recreates get_league() using Unicode escape sequences for Cyrillic strings.
-- This prevents garbled league names when copy-pasting via Windows clipboard.
--
-- Unicode values:
--   Злато      = E'\u0417\u043b\u0430\u0442\u043e'
--   Сребър     = E'\u0421\u0440\u0435\u0431\u044a\u0440'
--   Бронз      = E'\u0411\u0440\u043e\u043d\u0437'
--   Начинаещи  = E'\u041d\u0430\u0447\u0438\u043d\u0430\u0435\u0449\u0438'
--
-- Run in Supabase SQL Editor → New query → Run

CREATE OR REPLACE FUNCTION get_league(p_rating INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_rating >= 1300 THEN
    RETURN E'\u0417\u043b\u0430\u0442\u043e';
  ELSIF p_rating >= 1000 THEN
    RETURN E'\u0421\u0440\u0435\u0431\u044a\u0440';
  ELSIF p_rating >= 700 THEN
    RETURN E'\u0411\u0440\u043e\u043d\u0437';
  ELSE
    RETURN E'\u041d\u0430\u0447\u0438\u043d\u0430\u0435\u0449\u0438';
  END IF;
END;
$$;

-- Backfill: fix any garbled league values already in profiles
UPDATE profiles SET league = get_league(rating) WHERE rating IS NOT NULL;

-- Backfill: fix any garbled league values in rankings_history
UPDATE rankings_history SET league = get_league(rating) WHERE rating IS NOT NULL;
