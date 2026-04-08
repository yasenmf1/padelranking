-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- CLUBS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS clubs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Bulgarian clubs
INSERT INTO clubs (name, city) VALUES
('Padel Sofia', 'София'),
('Padel Club Sofia', 'София'),
('Arena Padel', 'София'),
('Padel Plovdiv', 'Пловдив'),
('Padel Center Plovdiv', 'Пловдив'),
('Padel Varna', 'Варна'),
('Black Sea Padel', 'Варна'),
('Padel Burgas', 'Бургас'),
('Padel Stara Zagora', 'Стара Загора'),
('Padel Ruse', 'Русе'),
('Padel Pleven', 'Плевен'),
('Padel Blagoevgrad', 'Благоевград')
ON CONFLICT DO NOTHING;

-- =============================================
-- PROFILES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  club_id INTEGER REFERENCES clubs(id),
  rating INTEGER DEFAULT 500,
  league TEXT DEFAULT 'Начинаещи',
  approved_matches INTEGER DEFAULT 0,
  is_ranked BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  questionnaire_done BOOLEAN DEFAULT FALSE,
  questionnaire_score INTEGER,
  self_assessment_score INTEGER,          -- 0-100, тактическа самооценка
  self_assessment_data JSONB,             -- { "q1": "В", "q2": "Б", ... }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- MATCHES TABLE
-- Doubles (2v2) format:
--   Team 1: player1 (submitter) + player2 (partner)
--   Team 2: player3 (opponent 1) + player4 (opponent 2)
-- winner_id = team captain of winning team (player1_id or player3_id)
-- =============================================
CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  -- Team 1
  player1_id UUID REFERENCES profiles(id),
  player2_id UUID REFERENCES profiles(id),
  -- Team 2
  player3_id UUID REFERENCES profiles(id),
  player4_id UUID REFERENCES profiles(id),
  winner_id UUID REFERENCES profiles(id),
  match_type TEXT CHECK (match_type IN ('bo3', 'bo5')) DEFAULT 'bo3',
  sets_data JSONB,
  -- Ratings before (all 4 players)
  player1_rating_before INTEGER,
  player2_rating_before INTEGER,
  player3_rating_before INTEGER,
  player4_rating_before INTEGER,
  -- Ratings after (all 4 players, set on approval)
  player1_rating_after INTEGER,
  player2_rating_after INTEGER,
  player3_rating_after INTEGER,
  player4_rating_after INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  club_id INTEGER REFERENCES clubs(id),
  played_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_by UUID REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- RANKINGS HISTORY TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS rankings_history (
  id SERIAL PRIMARY KEY,
  player_id UUID REFERENCES profiles(id),
  rating INTEGER NOT NULL,
  league TEXT NOT NULL,
  match_id INTEGER REFERENCES matches(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rankings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- Clubs: anyone can read
CREATE POLICY "clubs_read_all" ON clubs FOR SELECT USING (true);

-- Profiles: public read
CREATE POLICY "profiles_read_all" ON profiles FOR SELECT USING (true);

-- Profiles: insert own
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Profiles: update own
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Profiles: admin can update anyone
CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);

-- Matches: anyone can read
CREATE POLICY "matches_read_all" ON matches FOR SELECT USING (true);

-- Matches: authenticated users can insert
CREATE POLICY "matches_insert_auth" ON matches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Matches: only admins can update
CREATE POLICY "matches_update_admin" ON matches FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);

-- Rankings history: anyone can read
CREATE POLICY "rankings_read_all" ON rankings_history FOR SELECT USING (true);

-- Rankings history: only admins can insert
CREATE POLICY "rankings_insert_admin" ON rankings_history FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);

-- =============================================
-- FUNCTION: Update updated_at timestamp
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_profiles_rating ON profiles(rating DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_league ON profiles(league);
CREATE INDEX IF NOT EXISTS idx_profiles_is_ranked ON profiles(is_ranked);
CREATE INDEX IF NOT EXISTS idx_matches_player1 ON matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2 ON matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_rankings_player ON rankings_history(player_id);
