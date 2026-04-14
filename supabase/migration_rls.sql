-- ── Complete RLS policies for all tables ─────────────────────────────────
-- Idempotent: drops and recreates every policy.
-- Run in Supabase SQL Editor → New query → Run

-- ── Helper: reusable admin check ─────────────────────────────────────────
-- We inline the check instead of a function so it works inside policy USING clauses.
-- Pattern: EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. profiles
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read_all"    ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own"  ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON profiles;

-- Everyone can read profiles (needed for leaderboard, match cards, etc.)
CREATE POLICY "profiles_read_all" ON profiles
  FOR SELECT USING (true);

-- Only the user themselves can insert their own profile row
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Only the user themselves (or admin) can update their profile
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  )
  WITH CHECK (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- DELETE intentionally not allowed (no policy = denied)

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. matches
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matches_read_all"         ON matches;
DROP POLICY IF EXISTS "matches_insert_auth"      ON matches;
DROP POLICY IF EXISTS "matches_update_participant" ON matches;
DROP POLICY IF EXISTS "matches_delete_admin"     ON matches;

-- Everyone can read matches
CREATE POLICY "matches_read_all" ON matches
  FOR SELECT USING (true);

-- Any logged-in user can submit a match
CREATE POLICY "matches_insert_auth" ON matches
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Participants (any of the 4 players / submitter) or admin can update
CREATE POLICY "matches_update_participant" ON matches
  FOR UPDATE USING (
    auth.uid() IN (player1_id, player2_id, player3_id, player4_id, submitted_by)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- Only admin can delete matches
CREATE POLICY "matches_delete_admin" ON matches
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. rankings_history
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE rankings_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rankings_read_all"              ON rankings_history;
DROP POLICY IF EXISTS "rankings_insert_authenticated"  ON rankings_history;

-- Everyone can read ranking history (for ELO chart)
CREATE POLICY "rankings_read_all" ON rankings_history
  FOR SELECT USING (true);

-- Only authenticated users can insert (SECURITY DEFINER functions call this)
CREATE POLICY "rankings_insert_authenticated" ON rankings_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. match_requests
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE match_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matchreq_read_all"    ON match_requests;
DROP POLICY IF EXISTS "matchreq_insert_own"  ON match_requests;
DROP POLICY IF EXISTS "matchreq_update_own"  ON match_requests;
DROP POLICY IF EXISTS "matchreq_delete_own"  ON match_requests;

-- Everyone can see open match requests
CREATE POLICY "matchreq_read_all" ON match_requests
  FOR SELECT USING (true);

-- Only the owner can insert their own request
CREATE POLICY "matchreq_insert_own" ON match_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Only the owner can update their own request
CREATE POLICY "matchreq_update_own" ON match_requests
  FOR UPDATE USING (auth.uid() = user_id);

-- Owner or admin can delete
CREATE POLICY "matchreq_delete_own" ON match_requests
  FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. push_subscriptions
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_read_own"    ON push_subscriptions;
DROP POLICY IF EXISTS "push_insert_own"  ON push_subscriptions;
DROP POLICY IF EXISTS "push_update_own"  ON push_subscriptions;
DROP POLICY IF EXISTS "push_delete_own"  ON push_subscriptions;
DROP POLICY IF EXISTS "push_read_admin"  ON push_subscriptions;

-- Owner can read their own subscriptions
CREATE POLICY "push_read_own" ON push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Owner can insert their own subscription
CREATE POLICY "push_insert_own" ON push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Owner can update (refresh) their own subscription
CREATE POLICY "push_update_own" ON push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

-- Owner can delete (unsubscribe)
CREATE POLICY "push_delete_own" ON push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- NOTE: The send-push-notification Edge Function uses the service_role key,
-- which bypasses RLS entirely — no extra admin read policy needed.

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. in_app_notifications
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_read_own"   ON in_app_notifications;
DROP POLICY IF EXISTS "notif_update_own" ON in_app_notifications;

-- User can only read their own notifications
CREATE POLICY "notif_read_own" ON in_app_notifications
  FOR SELECT USING (auth.uid() = user_id);

-- User can mark their own notifications as read
CREATE POLICY "notif_update_own" ON in_app_notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- INSERT intentionally omitted — only SECURITY DEFINER functions insert here

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. contact_messages
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_insert_all"    ON contact_messages;
DROP POLICY IF EXISTS "contact_read_admin"    ON contact_messages;
DROP POLICY IF EXISTS "contact_update_admin"  ON contact_messages;

-- Any authenticated user can submit a contact message
CREATE POLICY "contact_insert_all" ON contact_messages
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only admin can read contact messages
CREATE POLICY "contact_read_admin" ON contact_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- Only admin can update (mark as handled)
CREATE POLICY "contact_update_admin" ON contact_messages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. match_players (junction table — if it exists)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'match_players') THEN

    ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "mp_read_all"         ON match_players;
    DROP POLICY IF EXISTS "mp_insert_auth"      ON match_players;
    DROP POLICY IF EXISTS "mp_update_participant" ON match_players;
    DROP POLICY IF EXISTS "mp_delete_admin"     ON match_players;

    CREATE POLICY "mp_read_all" ON match_players
      FOR SELECT USING (true);

    CREATE POLICY "mp_insert_auth" ON match_players
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

    CREATE POLICY "mp_update_participant" ON match_players
      FOR UPDATE USING (
        auth.uid() = player_id
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
      );

    CREATE POLICY "mp_delete_admin" ON match_players
      FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
      );

    RAISE NOTICE 'match_players RLS policies applied.';
  ELSE
    RAISE NOTICE 'match_players table does not exist — skipped.';
  END IF;
END;
$$;
