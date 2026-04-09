-- ── Matchmaking + Push Subscriptions ─────────────────────────────────────
-- Run in Supabase SQL Editor → New query → Run

-- ── STEP 1: match_requests ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_requests (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  city           TEXT NOT NULL,
  club           TEXT NOT NULL,
  date           DATE NOT NULL,
  time           TIME NOT NULL,
  players_needed INTEGER DEFAULT 3 CHECK (players_needed IN (1, 2, 3)),
  status         TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  expires_at     TIMESTAMPTZ
);

ALTER TABLE match_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matchreq_read_all"    ON match_requests;
DROP POLICY IF EXISTS "matchreq_insert_own"  ON match_requests;
DROP POLICY IF EXISTS "matchreq_delete_own"  ON match_requests;
DROP POLICY IF EXISTS "matchreq_update_own"  ON match_requests;

CREATE POLICY "matchreq_read_all"   ON match_requests FOR SELECT USING (true);
CREATE POLICY "matchreq_insert_own" ON match_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "matchreq_delete_own" ON match_requests FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "matchreq_update_own" ON match_requests FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_matchreq_city       ON match_requests(city);
CREATE INDEX IF NOT EXISTS idx_matchreq_status     ON match_requests(status);
CREATE INDEX IF NOT EXISTS idx_matchreq_expires    ON match_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_matchreq_user       ON match_requests(user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE match_requests;

-- ── STEP 2: push_subscriptions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  city         TEXT,   -- user's preferred city for filtering
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_insert_own"  ON push_subscriptions;
DROP POLICY IF EXISTS "push_delete_own"  ON push_subscriptions;
DROP POLICY IF EXISTS "push_read_admin"  ON push_subscriptions;

CREATE POLICY "push_insert_own" ON push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_delete_own" ON push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
-- Edge functions read all subscriptions server-side (SECURITY DEFINER handles this)

-- ── STEP 3: Auto-expire old match_requests ────────────────────────────────
-- Optional: run this periodically or via cron in Supabase
-- UPDATE match_requests SET status = 'closed'
-- WHERE status = 'open' AND expires_at < NOW();
