-- ── Individual ELO delta per player (2v2) ────────────────────────────────
-- Each player's expected score is calculated against the OPPONENT TEAM AVERAGE.
-- This means stronger players gain fewer points for winning (and lose more for losing).
-- Run in Supabase SQL Editor → New query → Run

-- ── DROP old functions ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS confirm_match(INTEGER);
DROP FUNCTION IF EXISTS admin_resolve_match(INTEGER, TEXT);

-- ── confirm_match ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION confirm_match(p_match_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v          matches%ROWTYPE;
  v_k        INTEGER;
  v_t1_avg   FLOAT;
  v_t2_avg   FLOAT;
  v_exp_p1   FLOAT;
  v_exp_p2   FLOAT;
  v_exp_p3   FLOAT;
  v_exp_p4   FLOAT;
  v_res_t1   FLOAT;
  v_res_t2   FLOAT;
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

  -- Count set wins
  IF v.sets_data IS NOT NULL THEN
    FOR v_set IN SELECT * FROM jsonb_array_elements(v.sets_data) LOOP
      IF (v_set->>'p1')::INTEGER > (v_set->>'p2')::INTEGER THEN
        v_t1w := v_t1w + 1;
      ELSIF (v_set->>'p2')::INTEGER > (v_set->>'p1')::INTEGER THEN
        v_t2w := v_t2w + 1;
      END IF;
    END LOOP;
  END IF;

  -- Pre-match ratings
  v_p1r := COALESCE(v.player1_rating_before, 500);
  v_p2r := COALESCE(v.player2_rating_before, 500);
  v_p3r := COALESCE(v.player3_rating_before, 500);
  v_p4r := COALESCE(v.player4_rating_before, 500);

  -- Opponent team averages (each player is compared against the OTHER team's average)
  v_t1_avg := (v_p1r + v_p2r) / 2.0;
  v_t2_avg := (v_p3r + v_p4r) / 2.0;

  -- K factor
  v_k := CASE WHEN v.match_type = 'bo5' THEN 48 ELSE 32 END;

  -- Match result
  v_res_t1 := CASE WHEN v_t1w > v_t2w THEN 1.0 ELSE 0.0 END;
  v_res_t2 := 1.0 - v_res_t1;

  -- Individual expected scores (each player vs opponent team average)
  v_exp_p1 := 1.0 / (1.0 + POWER(10.0, (v_t2_avg - v_p1r) / 400.0));
  v_exp_p2 := 1.0 / (1.0 + POWER(10.0, (v_t2_avg - v_p2r) / 400.0));
  v_exp_p3 := 1.0 / (1.0 + POWER(10.0, (v_t1_avg - v_p3r) / 400.0));
  v_exp_p4 := 1.0 / (1.0 + POWER(10.0, (v_t1_avg - v_p4r) / 400.0));

  -- Individual new ratings
  v_p1_new := GREATEST(0, v_p1r + ROUND(v_k * (v_res_t1 - v_exp_p1)));
  v_p2_new := GREATEST(0, v_p2r + ROUND(v_k * (v_res_t1 - v_exp_p2)));
  v_p3_new := GREATEST(0, v_p3r + ROUND(v_k * (v_res_t2 - v_exp_p3)));
  v_p4_new := GREATEST(0, v_p4r + ROUND(v_k * (v_res_t2 - v_exp_p4)));

  -- Update match
  UPDATE matches SET
    status               = 'confirmed',
    confirmed_by         = auth.uid(),
    confirmed_at         = NOW(),
    player1_rating_after = v_p1_new,
    player2_rating_after = v_p2_new,
    player3_rating_after = v_p3_new,
    player4_rating_after = v_p4_new
  WHERE id = p_match_id;

  -- Update player 1
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

  -- Update player 2
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

  -- Update player 3
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

  -- Update player 4
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
    'success', true,
    'p1_new',  v_p1_new, 'p2_new', v_p2_new,
    'p3_new',  v_p3_new, 'p4_new', v_p4_new,
    'd1', v_p1_new - v_p1r,
    'd2', v_p2_new - v_p2r,
    'd3', v_p3_new - v_p3r,
    'd4', v_p4_new - v_p4r
  );
END;
$$;

-- ── admin_resolve_match ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_resolve_match(p_match_id INTEGER, p_action TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v          matches%ROWTYPE;
  v_k        INTEGER;
  v_t1_avg   FLOAT;
  v_t2_avg   FLOAT;
  v_exp_p1   FLOAT;
  v_exp_p2   FLOAT;
  v_exp_p3   FLOAT;
  v_exp_p4   FLOAT;
  v_res_t1   FLOAT;
  v_res_t2   FLOAT;
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
    FOR v_set IN SELECT * FROM jsonb_array_elements(v.sets_data) LOOP
      IF (v_set->>'p1')::INTEGER > (v_set->>'p2')::INTEGER THEN v_t1w := v_t1w + 1;
      ELSIF (v_set->>'p2')::INTEGER > (v_set->>'p1')::INTEGER THEN v_t2w := v_t2w + 1;
      END IF;
    END LOOP;
  END IF;

  -- Pre-match ratings
  v_p1r := COALESCE(v.player1_rating_before, 500);
  v_p2r := COALESCE(v.player2_rating_before, 500);
  v_p3r := COALESCE(v.player3_rating_before, 500);
  v_p4r := COALESCE(v.player4_rating_before, 500);

  -- Opponent team averages
  v_t1_avg := (v_p1r + v_p2r) / 2.0;
  v_t2_avg := (v_p3r + v_p4r) / 2.0;

  -- K factor
  v_k := CASE WHEN v.match_type = 'bo5' THEN 48 ELSE 32 END;

  -- Match result
  v_res_t1 := CASE WHEN v_t1w > v_t2w THEN 1.0 ELSE 0.0 END;
  v_res_t2 := 1.0 - v_res_t1;

  -- Individual expected scores
  v_exp_p1 := 1.0 / (1.0 + POWER(10.0, (v_t2_avg - v_p1r) / 400.0));
  v_exp_p2 := 1.0 / (1.0 + POWER(10.0, (v_t2_avg - v_p2r) / 400.0));
  v_exp_p3 := 1.0 / (1.0 + POWER(10.0, (v_t1_avg - v_p3r) / 400.0));
  v_exp_p4 := 1.0 / (1.0 + POWER(10.0, (v_t1_avg - v_p4r) / 400.0));

  -- Individual new ratings
  v_p1_new := GREATEST(0, v_p1r + ROUND(v_k * (v_res_t1 - v_exp_p1)));
  v_p2_new := GREATEST(0, v_p2r + ROUND(v_k * (v_res_t1 - v_exp_p2)));
  v_p3_new := GREATEST(0, v_p3r + ROUND(v_k * (v_res_t2 - v_exp_p3)));
  v_p4_new := GREATEST(0, v_p4r + ROUND(v_k * (v_res_t2 - v_exp_p4)));

  -- Update match
  UPDATE matches SET
    status               = 'approved',
    reviewed_by          = auth.uid(),
    player1_rating_after = v_p1_new,
    player2_rating_after = v_p2_new,
    player3_rating_after = v_p3_new,
    player4_rating_after = v_p4_new
  WHERE id = p_match_id;

  -- Update player 1
  IF v.player1_id IS NOT NULL THEN
    UPDATE profiles SET rating = v_p1_new, league = get_league(v_p1_new),
      approved_matches = COALESCE(approved_matches, 0) + 1,
      is_ranked = (COALESCE(approved_matches, 0) + 1 >= 5), updated_at = NOW()
    WHERE id = v.player1_id;
    INSERT INTO rankings_history (player_id, rating, league, match_id)
      VALUES (v.player1_id, v_p1_new, get_league(v_p1_new), p_match_id);
  END IF;

  -- Update player 2
  IF v.player2_id IS NOT NULL THEN
    UPDATE profiles SET rating = v_p2_new, league = get_league(v_p2_new),
      approved_matches = COALESCE(approved_matches, 0) + 1,
      is_ranked = (COALESCE(approved_matches, 0) + 1 >= 5), updated_at = NOW()
    WHERE id = v.player2_id;
    INSERT INTO rankings_history (player_id, rating, league, match_id)
      VALUES (v.player2_id, v_p2_new, get_league(v_p2_new), p_match_id);
  END IF;

  -- Update player 3
  IF v.player3_id IS NOT NULL THEN
    UPDATE profiles SET rating = v_p3_new, league = get_league(v_p3_new),
      approved_matches = COALESCE(approved_matches, 0) + 1,
      is_ranked = (COALESCE(approved_matches, 0) + 1 >= 5), updated_at = NOW()
    WHERE id = v.player3_id;
    INSERT INTO rankings_history (player_id, rating, league, match_id)
      VALUES (v.player3_id, v_p3_new, get_league(v_p3_new), p_match_id);
  END IF;

  -- Update player 4
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
    'p1_new',  v_p1_new, 'p2_new', v_p2_new,
    'p3_new',  v_p3_new, 'p4_new', v_p4_new,
    'd1', v_p1_new - v_p1r,
    'd2', v_p2_new - v_p2r,
    'd3', v_p3_new - v_p3r,
    'd4', v_p4_new - v_p4r,
    't1_avg', v_t1_avg, 't2_avg', v_t2_avg
  );
END;
$$;

-- ── Re-grant permissions ──────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION confirm_match(INTEGER)              TO authenticated;
GRANT EXECUTE ON FUNCTION admin_resolve_match(INTEGER, TEXT)  TO authenticated;
