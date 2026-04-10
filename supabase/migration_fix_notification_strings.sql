-- ── Fix notification function string encoding ─────────────────────────────
-- Recreates functions with Unicode escape sequences for Cyrillic strings.
-- This avoids clipboard/editor encoding issues when running in Supabase SQL Editor.
-- Run in Supabase SQL Editor → New query → Run

-- Unicode escape reference (PostgreSQL E'...' syntax):
--   Мач потвърден   = E'\u041c\u0430\u0447 \u043f\u043e\u0442\u0432\u044a\u0440\u0434\u0435\u043d'
--   Съобщение       = E'\u0421\u044a\u043e\u0431\u0449\u0435\u043d\u0438\u0435'
--   от              = E'\u043e\u0442'
--   администратора  = E'\u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430'
--   Нов мач         = E'\u041d\u043e\u0432 \u043c\u0430\u0447'
--   за потвърждение = E'\u0437\u0430 \u043f\u043e\u0442\u0432\u044a\u0440\u0436\u0434\u0435\u043d\u0438\u0435'
--   Имаш нов мач    = E'\u0418\u043c\u0430\u0448 \u043d\u043e\u0432 \u043c\u0430\u0447'
--   Оспорен мач     = E'\u041e\u0441\u043f\u043e\u0440\u0435\u043d \u043c\u0430\u0447'
--   Оспорен от      = E'\u041e\u0441\u043f\u043e\u0440\u0435\u043d \u043e\u0442'
--   одобрен от Admin= E'\u043e\u0434\u043e\u0431\u0440\u0435\u043d \u043e\u0442 Admin'
--   ELO             = 'ELO'

-- ── DROP old functions ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS admin_broadcast_notification(TEXT);
DROP FUNCTION IF EXISTS admin_send_notification(UUID, TEXT);
DROP FUNCTION IF EXISTS notify_match_submitted(INTEGER);
DROP TRIGGER IF EXISTS match_status_notifications ON matches;
DROP FUNCTION IF EXISTS trigger_match_notifications();

-- ── trigger_match_notifications ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_match_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d1   INTEGER;
  v_d2   INTEGER;
  v_d3   INTEGER;
  v_d4   INTEGER;
  v_disp_username TEXT;
BEGIN
  -- ── Match confirmed ───────────────────────────────────────────────────
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    v_d1 := COALESCE(NEW.player1_rating_after, 0) - COALESCE(NEW.player1_rating_before, 500);
    v_d2 := COALESCE(NEW.player2_rating_after, 0) - COALESCE(NEW.player2_rating_before, 500);
    v_d3 := COALESCE(NEW.player3_rating_after, 0) - COALESCE(NEW.player3_rating_before, 500);
    v_d4 := COALESCE(NEW.player4_rating_after, 0) - COALESCE(NEW.player4_rating_before, 500);

    IF NEW.player1_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player1_id,
        E'\u041c\u0430\u0447 \u043f\u043e\u0442\u0432\u044a\u0440\u0434\u0435\u043d! \ud83c\udfbe',
        'ELO: ' || (CASE WHEN v_d1 >= 0 THEN '+' ELSE '' END) || v_d1::text,
        'match'
      );
    END IF;
    IF NEW.player2_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player2_id,
        E'\u041c\u0430\u0447 \u043f\u043e\u0442\u0432\u044a\u0440\u0434\u0435\u043d! \ud83c\udfbe',
        'ELO: ' || (CASE WHEN v_d2 >= 0 THEN '+' ELSE '' END) || v_d2::text,
        'match'
      );
    END IF;
    IF NEW.player3_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player3_id,
        E'\u041c\u0430\u0447 \u043f\u043e\u0442\u0432\u044a\u0440\u0434\u0435\u043d! \ud83c\udfbe',
        'ELO: ' || (CASE WHEN v_d3 >= 0 THEN '+' ELSE '' END) || v_d3::text,
        'match'
      );
    END IF;
    IF NEW.player4_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player4_id,
        E'\u041c\u0430\u0447 \u043f\u043e\u0442\u0432\u044a\u0440\u0434\u0435\u043d! \ud83c\udfbe',
        'ELO: ' || (CASE WHEN v_d4 >= 0 THEN '+' ELSE '' END) || v_d4::text,
        'match'
      );
    END IF;
  END IF;

  -- ── Match approved ────────────────────────────────────────────────────
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    v_d1 := COALESCE(NEW.player1_rating_after, 0) - COALESCE(NEW.player1_rating_before, 500);
    v_d2 := COALESCE(NEW.player2_rating_after, 0) - COALESCE(NEW.player2_rating_before, 500);
    v_d3 := COALESCE(NEW.player3_rating_after, 0) - COALESCE(NEW.player3_rating_before, 500);
    v_d4 := COALESCE(NEW.player4_rating_after, 0) - COALESCE(NEW.player4_rating_before, 500);

    IF NEW.player1_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player1_id,
        E'\u041c\u0430\u0447 \u043e\u0434\u043e\u0431\u0440\u0435\u043d \u2705',
        'ELO: ' || (CASE WHEN v_d1 >= 0 THEN '+' ELSE '' END) || v_d1::text,
        'admin'
      );
    END IF;
    IF NEW.player2_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player2_id,
        E'\u041c\u0430\u0447 \u043e\u0434\u043e\u0431\u0440\u0435\u043d \u2705',
        'ELO: ' || (CASE WHEN v_d2 >= 0 THEN '+' ELSE '' END) || v_d2::text,
        'admin'
      );
    END IF;
    IF NEW.player3_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player3_id,
        E'\u041c\u0430\u0447 \u043e\u0434\u043e\u0431\u0440\u0435\u043d \u2705',
        'ELO: ' || (CASE WHEN v_d3 >= 0 THEN '+' ELSE '' END) || v_d3::text,
        'admin'
      );
    END IF;
    IF NEW.player4_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player4_id,
        E'\u041c\u0430\u0447 \u043e\u0434\u043e\u0431\u0440\u0435\u043d \u2705',
        'ELO: ' || (CASE WHEN v_d4 >= 0 THEN '+' ELSE '' END) || v_d4::text,
        'admin'
      );
    END IF;
  END IF;

  -- ── Match disputed — notify admins ────────────────────────────────────
  IF NEW.status = 'disputed' AND (OLD.status IS DISTINCT FROM 'disputed') THEN
    SELECT username INTO v_disp_username FROM profiles WHERE id = NEW.disputed_by;
    INSERT INTO in_app_notifications (user_id, title, message, type)
      SELECT id,
        E'\u26a0\ufe0f ' || E'\u041e\u0441\u043f\u043e\u0440\u0435\u043d \u043c\u0430\u0447 #' || NEW.id,
        E'\u041e\u0441\u043f\u043e\u0440\u0435\u043d \u043e\u0442 @' || COALESCE(v_disp_username, 'Unknown') || ': ' || COALESCE(NEW.dispute_reason, ''),
        'admin'
      FROM profiles WHERE is_admin = TRUE;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER match_status_notifications
  AFTER UPDATE OF status ON matches
  FOR EACH ROW
  EXECUTE FUNCTION trigger_match_notifications();

-- ── notify_match_submitted ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_match_submitted(p_match_id INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v            matches%ROWTYPE;
  v_submitter  TEXT;
BEGIN
  SELECT * INTO v FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT username INTO v_submitter FROM profiles WHERE id = v.submitted_by;

  IF v.player3_id IS NOT NULL THEN
    INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
      v.player3_id,
      E'\u041d\u043e\u0432 \u043c\u0430\u0447 \ud83c\udfbe',
      E'\u0418\u043c\u0430\u0448 \u043d\u043e\u0432 \u043c\u0430\u0447 \u0437\u0430 \u043f\u043e\u0442\u0432\u044a\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u043e\u0442 @' || COALESCE(v_submitter, 'Unknown'),
      'match'
    );
  END IF;

  IF v.player4_id IS NOT NULL AND v.player4_id IS DISTINCT FROM v.player3_id THEN
    INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
      v.player4_id,
      E'\u041d\u043e\u0432 \u043c\u0430\u0447 \ud83c\udfbe',
      E'\u0418\u043c\u0430\u0448 \u043d\u043e\u0432 \u043c\u0430\u0447 \u0437\u0430 \u043f\u043e\u0442\u0432\u044a\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u043e\u0442 @' || COALESCE(v_submitter, 'Unknown'),
      'match'
    );
  END IF;
END;
$$;

-- ── admin_broadcast_notification ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_broadcast_notification(p_message TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_message IS NULL OR TRIM(p_message) = '' THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;
  INSERT INTO in_app_notifications (user_id, title, message, type)
    SELECT id,
      E'\ud83d\udce2 ' || E'\u0421\u044a\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u043e\u0442 \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430',
      TRIM(p_message),
      'admin'
    FROM profiles;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── admin_send_notification ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_send_notification(p_user_id UUID, p_message TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_message IS NULL OR TRIM(p_message) = '' THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;
  INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
    p_user_id,
    E'\ud83d\udce8 ' || E'\u0421\u044a\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u043e\u0442 \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430',
    TRIM(p_message),
    'admin'
  );
END;
$$;

-- ── Re-grant permissions ──────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION notify_match_submitted(INTEGER)              TO authenticated;
GRANT EXECUTE ON FUNCTION admin_broadcast_notification(TEXT)           TO authenticated;
GRANT EXECUTE ON FUNCTION admin_send_notification(UUID, TEXT)          TO authenticated;
