-- ── 1. Add new clubs (Sofia) ─────────────────────────────────────────────
INSERT INTO clubs (name, city)
SELECT 'Padel DECATHLON', E'\u0421\u043e\u0444\u0438\u044f'
WHERE NOT EXISTS (
  SELECT 1 FROM clubs WHERE name = 'Padel DECATHLON'
);

INSERT INTO clubs (name, city)
SELECT 'Padel Club AYA', E'\u0421\u043e\u0444\u0438\u044f'
WHERE NOT EXISTS (
  SELECT 1 FROM clubs WHERE name = 'Padel Club AYA'
);

-- ── 2. Add level_preference to match_requests ─────────────────────────────
ALTER TABLE match_requests
  ADD COLUMN IF NOT EXISTS level_preference TEXT DEFAULT 'all';
  -- values: 'similar' | 'stronger' | 'all'
