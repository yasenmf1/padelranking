const { Database } = require('node-sqlite3-wasm');
const path = require('path');
require('dotenv').config();

const DB_PATH = path.resolve(process.env.DB_PATH || './server/db/padel.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'player',  -- 'player' | 'club_admin' | 'admin'
      avatar_url TEXT,
      city TEXT,
      level TEXT DEFAULT 'beginner',        -- 'beginner' | 'intermediate' | 'advanced' | 'pro'
      rating REAL DEFAULT 1000,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clubs (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      city TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      website TEXT,
      logo_url TEXT,
      courts_count INTEGER DEFAULT 1,
      open_time TEXT DEFAULT '08:00',
      close_time TEXT DEFAULT '22:00',
      price_per_hour REAL DEFAULT 20.00,
      approved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courts (
      id TEXT PRIMARY KEY,
      club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      surface TEXT DEFAULT 'artificial_grass', -- 'artificial_grass' | 'concrete' | 'carpet'
      indoor INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      court_id TEXT NOT NULL REFERENCES courts(id),
      club_id TEXT NOT NULL REFERENCES clubs(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      date TEXT NOT NULL,        -- YYYY-MM-DD
      start_time TEXT NOT NULL,  -- HH:MM
      end_time TEXT NOT NULL,    -- HH:MM
      status TEXT DEFAULT 'confirmed', -- 'confirmed' | 'cancelled'
      total_price REAL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(court_id, date, start_time)
    );

    CREATE TABLE IF NOT EXISTS partner_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      city TEXT NOT NULL,
      date TEXT NOT NULL,
      time_from TEXT NOT NULL,
      time_to TEXT NOT NULL,
      level TEXT,
      message TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      player1_id TEXT NOT NULL REFERENCES users(id),
      player2_id TEXT NOT NULL REFERENCES users(id),
      player3_id TEXT REFERENCES users(id),
      player4_id TEXT REFERENCES users(id),
      club_id TEXT REFERENCES clubs(id),
      date TEXT NOT NULL,
      score TEXT,
      winner_team INTEGER,  -- 1 or 2
      booking_id TEXT REFERENCES bookings(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_court_date ON bookings(court_id, date);
    CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
    CREATE INDEX IF NOT EXISTS idx_clubs_city ON clubs(city);
    CREATE INDEX IF NOT EXISTS idx_partner_requests_city_date ON partner_requests(city, date);
  `);
}

module.exports = { getDb };
