-- ── Unique match constraint (race condition prevention) ───────────────────
-- Prevents two players from simultaneously submitting the same match.
-- A match is considered duplicate if: same 4 players + within 10 minutes.
-- Run in Supabase SQL Editor → New query → Run

-- ── 1. Add match_hash column ──────────────────────────────────────────────
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_hash TEXT;

-- ── 2. Function: generate a sorted hash from the 4 player UUIDs ───────────
-- Players are sorted alphabetically so order doesn't matter (P1+P2 vs P2+P1 = same hash)
CREATE OR REPLACE FUNCTION generate_match_hash(
  p1 UUID, p2 UUID, p3 UUID, p4 UUID
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN md5(
    array_to_string(
      ARRAY(
        SELECT unnest(ARRAY[p1::text, p2::text, p3::text, p4::text])
        ORDER BY 1
      ),
      '-'
    )
  );
END;
$$;

-- ── 3. Backfill hash for existing rows ────────────────────────────────────
UPDATE matches
SET match_hash = generate_match_hash(
  COALESCE(player1_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(player2_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(player3_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(player4_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE match_hash IS NULL;

-- ── 4. Unique index: same 4 players can't submit a match within 10 minutes ─
-- Groups created_at into 10-minute buckets using integer division.
-- Two concurrent inserts with the same hash in the same 10-min window → constraint violation.
DROP INDEX IF EXISTS idx_unique_match;
CREATE UNIQUE INDEX idx_unique_match
  ON matches (
    match_hash,
    (EXTRACT(epoch FROM date_trunc('minute', created_at))::bigint / 600)
  );

-- ── 5. Trigger: auto-populate match_hash on INSERT ───────────────────────
CREATE OR REPLACE FUNCTION set_match_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.match_hash := generate_match_hash(
    COALESCE(NEW.player1_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(NEW.player2_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(NEW.player3_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(NEW.player4_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_match_hash ON matches;
CREATE TRIGGER trg_set_match_hash
  BEFORE INSERT ON matches
  FOR EACH ROW
  EXECUTE FUNCTION set_match_hash();

-- Result: any duplicate INSERT within 10 minutes raises a unique_violation (code 23505).
-- The frontend already handles insertError — this will surface as a clear error message.
