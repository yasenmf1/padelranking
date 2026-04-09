-- ── Match confirmation system (full migration) ───────────────────────────
-- Run this entire script in Supabase SQL Editor → New query → Run

-- ── STEP 1: Add player3/player4 columns (migration_doubles was not applied) ──
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS player3_id            UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS player4_id            UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS player3_rating_before INTEGER,
  ADD COLUMN IF NOT EXISTS player4_rating_before INTEGER,
  ADD COLUMN IF NOT EXISTS player3_rating_after  INTEGER,
  ADD COLUMN IF NOT EXISTS player4_rating_after  INTEGER;

CREATE INDEX IF NOT EXISTS idx_matches_player3 ON matches(player3_id);
CREATE INDEX IF NOT EXISTS idx_matches_player4 ON matches(player4_id);

-- ── STEP 2: Fix status CHECK constraint ──────────────────────────────────
-- Drop old constraint, re-add with all valid values
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE matches ADD CONSTRAINT matches_status_check
  CHECK (status IN ('pending', 'confirmed', 'disputed', 'expired', 'approved', 'rejected'));

-- ── STEP 3: Add confirmation columns ─────────────────────────────────────
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS confirmed_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
  ADD COLUMN IF NOT EXISTS expires_at     TIMESTAMPTZ;

-- ── STEP 4: Set expires_at for existing pending matches ───────────────────
UPDATE matches
SET expires_at = created_at + INTERVAL '72 hours'
WHERE expires_at IS NULL AND status = 'pending';

-- ── STEP 5: RLS — allow rankings_history insert from authenticated users ──
-- (needed so the SECURITY DEFINER confirm function can insert history rows)
DROP POLICY IF EXISTS "rankings_insert_authenticated" ON rankings_history;
CREATE POLICY "rankings_insert_authenticated" ON rankings_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── STEP 6: Helper function — get league from rating ─────────────────────
CREATE OR REPLACE FUNCTION get_league(p_rating INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_rating >= 1300 THEN RETURN 'Злато';
  ELSIF p_rating >= 1000 THEN RETURN 'Сребър';
  ELSIF p_rating >= 700  THEN RETURN 'Бронз';
  ELSE RETURN 'Начинаещи';
  END IF;
END;
$$;

-- ── STEP 7: SECURITY DEFINER function — confirm_match ────────────────────
-- Called by the opponent (player3 or player4) to confirm a match.
-- Applies ELO to all 4 players atomically, bypasses RLS.
CREATE OR REPLACE FUNCTION confirm_match(p_match_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v          matches%ROWTYPE;
  v_t1_avg   INTEGER;
  v_t2_avg   INTEGER;
  v_k        INTEGER;
  v_exp1     FLOAT;
  v_new_t1   INTEGER;
  v_new_t2   INTEGER;
  v_d1       INTEGER;
  v_d2       INTEGER;
  v_t1w      INTEGER := 0;
  v_t2w      INTEGER := 0;
  v_set      JSONB;
  v_p1r      INTEGER;
  v_p2r      INTEGER;
  v_p3r      INTEGER;
  v_p4r      INTEGER;
  v_p1_new   INTEGER;
  v_p2_new   INTEGER;
  v_p3_new   INTEGER;
  v_p4_new   INTEGER;
BEGIN
  -- Lock and fetch match
  SELECT * INTO v FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Match not found');
  END IF;

  -- Only opponents (player3 or player4) can confirm
  IF auth.uid() NOT IN (v.player3_id, v.player4_id) THEN
    RETURN jsonb_build_object('error', 'Only opponents can confirm');
  END IF;

  -- Submitter cannot confirm their own match
  IF auth.uid() = v.submitted_by THEN
    RETURN jsonb_build_object('error', 'Cannot confirm your own match');
  END IF;

  IF v.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'Match is not pending');
  END IF;

  -- Check not expired
  IF v.expires_at IS NOT NULL AND v.expires_at < NOW() THEN
    UPDATE matches SET status = 'expired' WHERE id = p_match_id;
    RETURN jsonb_build_object('error', 'Match has expired');
  END IF;

  -- Count set wins from sets_data JSONB array
  IF v.sets_data IS NOT NULL THEN
    FOR v_set IN SELECT * FROM jsonb_array_elements(v.sets_data)
    LOOP
      IF (v_set->>'p1')::INTEGER > (v_set->>'p2')::INTEGER THEN
        v_t1w := v_t1w + 1;
      ELSIF (v_set->>'p2')::INTEGER > (v_set->>'p1')::INTEGER THEN
        v_t2w := v_t2w + 1;
      END IF;
    END LOOP;
  END IF;

  -- Use stored pre-match ratings
  v_p1r := COALESCE(v.player1_rating_before, 500);
  v_p2r := COALESCE(v.player2_rating_before, 500);
  v_p3r := COALESCE(v.player3_rating_before, 500);
  v_p4r := COALESCE(v.player4_rating_before, 500);

  v_t1_avg := (v_p1r + v_p2r) / 2;
  v_t2_avg := (v_p3r + v_p4r) / 2;

  -- ELO K factor
  v_k := CASE WHEN v.match_type = 'bo5' THEN 48 ELSE 32 END;

  -- Expected score for team 1
  v_exp1 := 1.0 / (1.0 + POWER(10.0, (v_t2_avg - v_t1_avg)::FLOAT / 400.0));

  -- New team averages
  v_new_t1 := ROUND(v_t1_avg + v_k * (CASE WHEN v_t1w > v_t2w THEN 1.0 ELSE 0.0 END - v_exp1));
  v_new_t2 := ROUND(v_t2_avg + v_k * (CASE WHEN v_t2w > v_t1w THEN 1.0 ELSE 0.0 END - (1.0 - v_exp1)));

  v_d1 := v_new_t1 - v_t1_avg;
  v_d2 := v_new_t2 - v_t2_avg;

  -- Individual new ratings
  v_p1_new := GREATEST(0, v_p1r + v_d1);
  v_p2_new := GREATEST(0, v_p2r + v_d1);
  v_p3_new := GREATEST(0, v_p3r + v_d2);
  v_p4_new := GREATEST(0, v_p4r + v_d2);

  -- Update match
  UPDATE matches SET
    status             = 'confirmed',
    confirmed_by       = auth.uid(),
    confirmed_at       = NOW(),
    player1_rating_after = v_p1_new,
    player2_rating_after = v_p2_new,
    player3_rating_after = v_p3_new,
    player4_rating_after = v_p4_new
  WHERE id = p_match_id;

  -- Update player 1 profile
  IF v.player1_id IS NOT NULL THEN
    UPDATE profiles SET
      rating           = v_p1_new,
      league           = get_league(v_p1_new),
      approved_matches = COALESCE(approved_matches, 0) + 1,
      is_ranked        = (COALESCE(approved_matches, 0) + 1 >= 5),
      updated_at       = NOW()
    WHERE id = v.player1_id;
    INSERT INTO rankings_history (player_id, rating, league, match_id)
      VALUES (v.player1_id, v_p1_new, get_league(v_p1_new), p_match_id);
  END IF;

  -- Update player 2 profile
  IF v.player2_id IS NOT NULL THEN
    UPDATE profiles SET
      rating           = v_p2_new,
      league           = get_league(v_p2_new),
      approved_matches = COALESCE(approved_matches, 0) + 1,
      is_ranked        = (COALESCE(approved_matches, 0) + 1 >= 5),
      updated_at       = NOW()
    WHERE id = v.player2_id;
    INSERT INTO rankings_history (player_id, rating, league, match_id)
      VALUES (v.player2_id, v_p2_new, get_league(v_p2_new), p_match_id);
  END IF;

  -- Update player 3 profile
  IF v.player3_id IS NOT NULL THEN
    UPDATE profiles SET
      rating           = v_p3_new,
      league           = get_league(v_p3_new),
      approved_matches = COALESCE(approved_matches, 0) + 1,
      is_ranked        = (COALESCE(approved_matches, 0) + 1 >= 5),
      updated_at       = NOW()
    WHERE id = v.player3_id;
    INSERT INTO rankings_history (player_id, rating, league, match_id)
      VALUES (v.player3_id, v_p3_new, get_league(v_p3_new), p_match_id);
  END IF;

  -- Update player 4 profile
  IF v.player4_id IS NOT NULL THEN
    UPDATE profiles SET
      rating           = v_p4_new,
      league           = get_league(v_p4_new),
      approved_matches = COALESCE(approved_matches, 0) + 1,
      is_ranked        = (COALESCE(approved_matches, 0) + 1 >= 5),
      updated_at       = NOW()
    WHERE id = v.player4_id;
    INSERT INTO rankings_history (player_id, rating, league, match_id)
      VALUES (v.player4_id, v_p4_new, get_league(v_p4_new), p_match_id);
  END IF;

  RETURN jsonb_build_object(
    'success',  true,
    'p1_new',   v_p1_new,
    'p2_new',   v_p2_new,
    'p3_new',   v_p3_new,
    'p4_new',   v_p4_new,
    'd1',       v_d1,
    'd2',       v_d2
  );
END;
$$;

-- ── STEP 8: SECURITY DEFINER function — dispute_match ────────────────────
-- Called by the opponent to dispute a match result.
CREATE OR REPLACE FUNCTION dispute_match(p_match_id INTEGER, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v matches%ROWTYPE;
BEGIN
  SELECT * INTO v FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Match not found');
  END IF;

  IF auth.uid() NOT IN (v.player3_id, v.player4_id) THEN
    RETURN jsonb_build_object('error', 'Only opponents can dispute');
  END IF;

  IF v.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'Match is not pending');
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RETURN jsonb_build_object('error', 'Dispute reason is required');
  END IF;

  UPDATE matches SET
    status         = 'disputed',
    disputed_by    = auth.uid(),
    dispute_reason = TRIM(p_reason)
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── STEP 9: SECURITY DEFINER function — admin_resolve_match ──────────────
-- Called by admin to approve or reject a disputed/pending match.
CREATE OR REPLACE FUNCTION admin_resolve_match(p_match_id INTEGER, p_action TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v          matches%ROWTYPE;
  v_t1_avg   INTEGER;
  v_t2_avg   INTEGER;
  v_k        INTEGER;
  v_exp1     FLOAT;
  v_new_t1   INTEGER;
  v_new_t2   INTEGER;
  v_d1       INTEGER;
  v_d2       INTEGER;
  v_t1w      INTEGER := 0;
  v_t2w      INTEGER := 0;
  v_set      JSONB;
  v_p1r      INTEGER;
  v_p2r      INTEGER;
  v_p3r      INTEGER;
  v_p4r      INTEGER;
  v_p1_new   INTEGER;
  v_p2_new   INTEGER;
  v_p3_new   INTEGER;
  v_p4_new   INTEGER;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE) THEN
    RETURN jsonb_build_object('error', 'Admin only');
  END IF;

  SELECT * INTO v FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Match not found');
  END IF;

  IF p_action = 'reject' THEN
    UPDATE matches SET status = 'rejected', reviewed_by = auth.uid() WHERE id = p_match_id;
    RETURN jsonb_build_object('success', true, 'action', 'rejected');
  END IF;

  IF p_action != 'approve' THEN
    RETURN jsonb_build_object('error', 'Invalid action. Use approve or reject');
  END IF;

  -- Count set wins
  IF v.sets_data IS NOT NULL THEN
    FOR v_set IN SELECT * FROM jsonb_array_elements(v.sets_data)
    LOOP
      IF (v_set->>'p1')::INTEGER > (v_set->>'p2')::INTEGER THEN v_t1w := v_t1w + 1;
      ELSIF (v_set->>'p2')::INTEGER > (v_set->>'p1')::INTEGER THEN v_t2w := v_t2w + 1;
      END IF;
    END LOOP;
  END IF;

  v_p1r := COALESCE(v.player1_rating_before, 500);
  v_p2r := COALESCE(v.player2_rating_before, 500);
  v_p3r := COALESCE(v.player3_rating_before, 500);
  v_p4r := COALESCE(v.player4_rating_before, 500);

  v_t1_avg := (v_p1r + v_p2r) / 2;
  v_t2_avg := (v_p3r + v_p4r) / 2;
  v_k      := CASE WHEN v.match_type = 'bo5' THEN 48 ELSE 32 END;
  v_exp1   := 1.0 / (1.0 + POWER(10.0, (v_t2_avg - v_t1_avg)::FLOAT / 400.0));

  v_new_t1 := ROUND(v_t1_avg + v_k * (CASE WHEN v_t1w > v_t2w THEN 1.0 ELSE 0.0 END - v_exp1));
  v_new_t2 := ROUND(v_t2_avg + v_k * (CASE WHEN v_t2w > v_t1w THEN 1.0 ELSE 0.0 END - (1.0 - v_exp1)));

  v_d1 := v_new_t1 - v_t1_avg;
  v_d2 := v_new_t2 - v_t2_avg;

  v_p1_new := GREATEST(0, v_p1r + v_d1);
  v_p2_new := GREATEST(0, v_p2r + v_d1);
  v_p3_new := GREATEST(0, v_p3r + v_d2);
  v_p4_new := GREATEST(0, v_p4r + v_d2);

  UPDATE matches SET
    status               = 'approved',
    reviewed_by          = auth.uid(),
    player1_rating_after = v_p1_new,
    player2_rating_after = v_p2_new,
    player3_rating_after = v_p3_new,
    player4_rating_after = v_p4_new
  WHERE id = p_match_id;

  IF v.player1_id IS NOT NULL THEN
    UPDATE profiles SET rating = v_p1_new, league = get_league(v_p1_new),
      approved_matches = COALESCE(approved_matches, 0) + 1,
      is_ranked = (COALESCE(approved_matches, 0) + 1 >= 5), updated_at = NOW()
    WHERE id = v.player1_id;
    INSERT INTO rankings_history (player_id, rating, league, match_id)
      VALUES (v.player1_id, v_p1_new, get_league(v_p1_new), p_match_id);
  END IF;

  IF v.player2_id IS NOT NULL THEN
    UPDATE profiles SET rating = v_p2_new, league = get_league(v_p2_new),
      approved_matches = COALESCE(approved_matches, 0) + 1,
      is_ranked = (COALESCE(approved_matches, 0) + 1 >= 5), updated_at = NOW()
    WHERE id = v.player2_id;
    INSERT INTO rankings_history (player_id, rating, league, match_id)
      VALUES (v.player2_id, v_p2_new, get_league(v_p2_new), p_match_id);
  END IF;

  IF v.player3_id IS NOT NULL THEN
    UPDATE profiles SET rating = v_p3_new, league = get_league(v_p3_new),
      approved_matches = COALESCE(approved_matches, 0) + 1,
      is_ranked = (COALESCE(approved_matches, 0) + 1 >= 5), updated_at = NOW()
    WHERE id = v.player3_id;
    INSERT INTO rankings_history (player_id, rating, league, match_id)
      VALUES (v.player3_id, v_p3_new, get_league(v_p3_new), p_match_id);
  END IF;

  IF v.player4_id IS NOT NULL THEN
    UPDATE profiles SET rating = v_p4_new, league = get_league(v_p4_new),
      approved_matches = COALESCE(approved_matches, 0) + 1,
      is_ranked = (COALESCE(approved_matches, 0) + 1 >= 5), updated_at = NOW()
    WHERE id = v.player4_id;
    INSERT INTO rankings_history (player_id, rating, league, match_id)
      VALUES (v.player4_id, v_p4_new, get_league(v_p4_new), p_match_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'action', 'approved',
    'p1_new', v_p1_new, 'p2_new', v_p2_new,
    'p3_new', v_p3_new, 'p4_new', v_p4_new,
    'd1', v_d1, 'd2', v_d2,
    't1_avg', v_t1_avg, 'new_t1_avg', v_new_t1,
    't2_avg', v_t2_avg, 'new_t2_avg', v_new_t2
  );
END;
$$;

-- ── STEP 10: Grant execute permissions to authenticated users ─────────────
GRANT EXECUTE ON FUNCTION confirm_match(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION dispute_match(INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_resolve_match(INTEGER, TEXT) TO authenticated;
