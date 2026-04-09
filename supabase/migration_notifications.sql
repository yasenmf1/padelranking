-- ── In-app notification system ───────────────────────────────────────────
-- Run in Supabase SQL Editor → New query → Run

-- ── STEP 1: Create in_app_notifications table ─────────────────────────────
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  type       TEXT DEFAULT 'system' CHECK (type IN ('match', 'admin', 'system')),
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user     ON in_app_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_unread   ON in_app_notifications(user_id, is_read) WHERE is_read = FALSE;

-- ── STEP 2: RLS ───────────────────────────────────────────────────────────
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
DROP POLICY IF EXISTS "notif_read_own"   ON in_app_notifications;
CREATE POLICY "notif_read_own" ON in_app_notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Users can mark their own notifications as read
DROP POLICY IF EXISTS "notif_update_own" ON in_app_notifications;
CREATE POLICY "notif_update_own" ON in_app_notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- No INSERT policy — only SECURITY DEFINER functions can insert

-- ── STEP 3: Enable Realtime ───────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE in_app_notifications;

-- ── STEP 4: Trigger — auto-notify on match status changes ─────────────────
CREATE OR REPLACE FUNCTION trigger_match_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d1   INTEGER;
  v_d2   INTEGER;
  v_disp_username TEXT;
BEGIN
  -- ── Match confirmed (by opponent) ─────────────────────────────────────
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    v_d1 := COALESCE(NEW.player1_rating_after, 0) - COALESCE(NEW.player1_rating_before, 500);
    v_d2 := COALESCE(NEW.player3_rating_after, 0) - COALESCE(NEW.player3_rating_before, 500);

    IF NEW.player1_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player1_id,
        'Мач потвърден! 🎾',
        'Мачът е потвърден. ELO: ' || (CASE WHEN v_d1 >= 0 THEN '+' ELSE '' END) || v_d1::text,
        'match'
      );
    END IF;
    IF NEW.player2_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player2_id,
        'Мач потвърден! 🎾',
        'Мачът е потвърден. ELO: ' || (CASE WHEN v_d1 >= 0 THEN '+' ELSE '' END) || v_d1::text,
        'match'
      );
    END IF;
    IF NEW.player3_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player3_id,
        'Мач потвърден! 🎾',
        'Мачът е потвърден. ELO: ' || (CASE WHEN v_d2 >= 0 THEN '+' ELSE '' END) || v_d2::text,
        'match'
      );
    END IF;
    IF NEW.player4_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player4_id,
        'Мач потвърден! 🎾',
        'Мачът е потвърден. ELO: ' || (CASE WHEN v_d2 >= 0 THEN '+' ELSE '' END) || v_d2::text,
        'match'
      );
    END IF;
  END IF;

  -- ── Match approved (by admin) ──────────────────────────────────────────
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    v_d1 := COALESCE(NEW.player1_rating_after, 0) - COALESCE(NEW.player1_rating_before, 500);
    v_d2 := COALESCE(NEW.player3_rating_after, 0) - COALESCE(NEW.player3_rating_before, 500);

    IF NEW.player1_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player1_id, 'Мач одобрен от Admin ✅',
        'Мачът е одобрен. ELO: ' || (CASE WHEN v_d1 >= 0 THEN '+' ELSE '' END) || v_d1::text,
        'admin'
      );
    END IF;
    IF NEW.player2_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player2_id, 'Мач одобрен от Admin ✅',
        'Мачът е одобрен. ELO: ' || (CASE WHEN v_d1 >= 0 THEN '+' ELSE '' END) || v_d1::text,
        'admin'
      );
    END IF;
    IF NEW.player3_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player3_id, 'Мач одобрен от Admin ✅',
        'Мачът е одобрен. ELO: ' || (CASE WHEN v_d2 >= 0 THEN '+' ELSE '' END) || v_d2::text,
        'admin'
      );
    END IF;
    IF NEW.player4_id IS NOT NULL THEN
      INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
        NEW.player4_id, 'Мач одобрен от Admin ✅',
        'Мачът е одобрен. ELO: ' || (CASE WHEN v_d2 >= 0 THEN '+' ELSE '' END) || v_d2::text,
        'admin'
      );
    END IF;
  END IF;

  -- ── Match disputed — notify admins ────────────────────────────────────
  IF NEW.status = 'disputed' AND (OLD.status IS DISTINCT FROM 'disputed') THEN
    SELECT username INTO v_disp_username FROM profiles WHERE id = NEW.disputed_by;
    INSERT INTO in_app_notifications (user_id, title, message, type)
      SELECT id,
        '⚠️ Оспорен мач #' || NEW.id,
        'Оспорен от @' || COALESCE(v_disp_username, 'Unknown') || ': ' || COALESCE(NEW.dispute_reason, ''),
        'admin'
      FROM profiles WHERE is_admin = TRUE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_status_notifications ON matches;
CREATE TRIGGER match_status_notifications
  AFTER UPDATE OF status ON matches
  FOR EACH ROW
  EXECUTE FUNCTION trigger_match_notifications();

-- ── STEP 5: notify_match_submitted — called from frontend after insert ─────
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
      'Нов мач за потвърждение 🎾',
      'Имаш нов мач за потвърждение от @' || COALESCE(v_submitter, 'Unknown'),
      'match'
    );
  END IF;

  IF v.player4_id IS NOT NULL AND v.player4_id IS DISTINCT FROM v.player3_id THEN
    INSERT INTO in_app_notifications (user_id, title, message, type) VALUES (
      v.player4_id,
      'Нов мач за потвърждение 🎾',
      'Имаш нов мач за потвърждение от @' || COALESCE(v_submitter, 'Unknown'),
      'match'
    );
  END IF;
END;
$$;

-- ── STEP 6: admin_broadcast_notification ─────────────────────────────────
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
    SELECT id, '📢 Съобщение от администратора', TRIM(p_message), 'admin'
    FROM profiles;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── STEP 7: admin_send_notification — send to a specific player ───────────
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
    '📨 Съобщение от администратора',
    TRIM(p_message),
    'admin'
  );
END;
$$;

-- ── STEP 8: Grant execute permissions ─────────────────────────────────────
GRANT EXECUTE ON FUNCTION notify_match_submitted(INTEGER)              TO authenticated;
GRANT EXECUTE ON FUNCTION admin_broadcast_notification(TEXT)           TO authenticated;
GRANT EXECUTE ON FUNCTION admin_send_notification(UUID, TEXT)          TO authenticated;
