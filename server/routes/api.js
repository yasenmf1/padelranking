const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── CLUBS ───────────────────────────────────────────────────────────────────

// GET /api/clubs  — list approved clubs, optional ?city=
router.get('/clubs', (req, res) => {
  const db = getDb();
  const { city, search } = req.query;
  let query = `
    SELECT c.*, u.name as owner_name
    FROM clubs c JOIN users u ON c.owner_id = u.id
    WHERE c.approved = 1
  `;
  const params = [];
  if (city) { query += ' AND c.city = ?'; params.push(city); }
  if (search) { query += ' AND (c.name LIKE ? OR c.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  query += ' ORDER BY c.name';
  res.json(db.prepare(query).all(...params));
});

// GET /api/clubs/:id
router.get('/clubs/:id', (req, res) => {
  const db = getDb();
  const club = db.prepare(`
    SELECT c.*, u.name as owner_name
    FROM clubs c JOIN users u ON c.owner_id = u.id
    WHERE c.id = ? AND c.approved = 1
  `).get(req.params.id);
  if (!club) return res.status(404).json({ error: 'Клубът не е намерен.' });

  const courts = db.prepare('SELECT * FROM courts WHERE club_id = ? AND active = 1').all(req.params.id);
  res.json({ ...club, courts });
});

// POST /api/clubs  — club_admin registers a club
router.post('/clubs', authenticate, requireRole('club_admin', 'admin'), (req, res) => {
  const { name, description, city, address, phone, email, website, courts_count, open_time, close_time, price_per_hour } = req.body;
  if (!name || !city || !address) {
    return res.status(400).json({ error: 'Име, град и адрес са задължителни.' });
  }
  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO clubs (id, owner_id, name, description, city, address, phone, email, website, courts_count, open_time, close_time, price_per_hour)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, name, description || null, city, address, phone || null, email || null, website || null,
    courts_count || 1, open_time || '08:00', close_time || '22:00', price_per_hour || 20);

  // auto-create courts
  const count = Math.min(parseInt(courts_count) || 1, 20);
  for (let i = 1; i <= count; i++) {
    db.prepare('INSERT INTO courts (id, club_id, name) VALUES (?, ?, ?)').run(uuidv4(), id, `Корт ${i}`);
  }

  res.status(201).json({ id, message: 'Клубът е регистриран и очаква одобрение.' });
});

// PUT /api/clubs/:id  — owner updates club
router.put('/clubs/:id', authenticate, (req, res) => {
  const db = getDb();
  const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(req.params.id);
  if (!club) return res.status(404).json({ error: 'Клубът не е намерен.' });
  if (club.owner_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нямате права.' });
  }
  const { name, description, city, address, phone, email, website, open_time, close_time, price_per_hour } = req.body;
  db.prepare(`
    UPDATE clubs SET name = COALESCE(?, name), description = COALESCE(?, description),
    city = COALESCE(?, city), address = COALESCE(?, address), phone = COALESCE(?, phone),
    email = COALESCE(?, email), website = COALESCE(?, website),
    open_time = COALESCE(?, open_time), close_time = COALESCE(?, close_time),
    price_per_hour = COALESCE(?, price_per_hour)
    WHERE id = ?
  `).run(name||null, description||null, city||null, address||null, phone||null,
    email||null, website||null, open_time||null, close_time||null, price_per_hour||null, req.params.id);
  res.json({ message: 'Клубът е обновен.' });
});

// PATCH /api/clubs/:id/approve  — admin approves club
router.patch('/clubs/:id/approve', authenticate, requireRole('admin'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE clubs SET approved = 1 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Клубът е одобрен.' });
});

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────

// GET /api/clubs/:id/availability?date=YYYY-MM-DD
router.get('/clubs/:id/availability', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Датата е задължителна.' });
  const db = getDb();
  const club = db.prepare('SELECT * FROM clubs WHERE id = ? AND approved = 1').get(req.params.id);
  if (!club) return res.status(404).json({ error: 'Клубът не е намерен.' });

  const courts = db.prepare('SELECT * FROM courts WHERE club_id = ? AND active = 1').all(req.params.id);
  const bookings = db.prepare(`
    SELECT court_id, start_time, end_time FROM bookings
    WHERE club_id = ? AND date = ? AND status = 'confirmed'
  `).all(req.params.id, date);

  const bookedMap = {};
  bookings.forEach(b => {
    if (!bookedMap[b.court_id]) bookedMap[b.court_id] = [];
    bookedMap[b.court_id].push({ start: b.start_time, end: b.end_time });
  });

  // generate 1-hour slots
  const slots = generateSlots(club.open_time, club.close_time);
  const result = courts.map(court => ({
    court,
    slots: slots.map(slot => ({
      ...slot,
      available: !(bookedMap[court.id] || []).some(b => b.start === slot.start)
    }))
  }));

  res.json({ date, price_per_hour: club.price_per_hour, courts: result });
});

function generateSlots(open, close) {
  const slots = [];
  let [h, m] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  while (h < ch || (h === ch && m < cm)) {
    const start = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    let nh = h + 1, nm = m;
    if (nh > ch || (nh === ch && nm > cm)) break;
    const end = `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`;
    slots.push({ start, end });
    h = nh; m = nm;
  }
  return slots;
}

// POST /api/bookings
router.post('/bookings', authenticate, (req, res) => {
  const { court_id, club_id, date, start_time, end_time, notes } = req.body;
  if (!court_id || !club_id || !date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Всички полета са задължителни.' });
  }
  const db = getDb();
  const club = db.prepare('SELECT * FROM clubs WHERE id = ? AND approved = 1').get(club_id);
  if (!club) return res.status(404).json({ error: 'Клубът не е намерен.' });

  const conflict = db.prepare(`
    SELECT id FROM bookings WHERE court_id = ? AND date = ? AND start_time = ? AND status = 'confirmed'
  `).get(court_id, date, start_time);
  if (conflict) return res.status(409).json({ error: 'Слотът вече е резервиран.' });

  const [sh, sm] = start_time.split(':').map(Number);
  const [eh, em] = end_time.split(':').map(Number);
  const hours = (eh * 60 + em - sh * 60 - sm) / 60;
  const total_price = hours * club.price_per_hour;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO bookings (id, court_id, club_id, user_id, date, start_time, end_time, total_price, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, court_id, club_id, req.user.id, date, start_time, end_time, total_price, notes || null);

  res.status(201).json({ id, total_price, message: 'Резервацията е потвърдена.' });
});

// GET /api/bookings  — user's own bookings
router.get('/bookings', authenticate, (req, res) => {
  const db = getDb();
  const bookings = db.prepare(`
    SELECT b.*, c.name as club_name, c.city as club_city, co.name as court_name
    FROM bookings b
    JOIN clubs c ON b.club_id = c.id
    JOIN courts co ON b.court_id = co.id
    WHERE b.user_id = ?
    ORDER BY b.date DESC, b.start_time DESC
  `).all(req.user.id);
  res.json(bookings);
});

// DELETE /api/bookings/:id  — cancel booking
router.delete('/bookings/:id', authenticate, (req, res) => {
  const db = getDb();
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Резервацията не е намерена.' });
  if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нямате права.' });
  }
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json({ message: 'Резервацията е отказана.' });
});

// ─── PARTNER REQUESTS ─────────────────────────────────────────────────────────

// GET /api/partners?city=&date=
router.get('/partners', (req, res) => {
  const db = getDb();
  const { city, date } = req.query;
  let query = `
    SELECT pr.*, u.name as user_name, u.level as user_level, u.rating as user_rating
    FROM partner_requests pr JOIN users u ON pr.user_id = u.id
    WHERE pr.active = 1 AND pr.date >= date('now')
  `;
  const params = [];
  if (city) { query += ' AND pr.city = ?'; params.push(city); }
  if (date) { query += ' AND pr.date = ?'; params.push(date); }
  query += ' ORDER BY pr.date, pr.time_from';
  res.json(db.prepare(query).all(...params));
});

// POST /api/partners
router.post('/partners', authenticate, (req, res) => {
  const { city, date, time_from, time_to, level, message } = req.body;
  if (!city || !date || !time_from || !time_to) {
    return res.status(400).json({ error: 'Град, дата и час са задължителни.' });
  }
  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO partner_requests (id, user_id, city, date, time_from, time_to, level, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, city, date, time_from, time_to, level || null, message || null);
  res.status(201).json({ id, message: 'Търсенето на партньор е публикувано.' });
});

// DELETE /api/partners/:id
router.delete('/partners/:id', authenticate, (req, res) => {
  const db = getDb();
  const pr = db.prepare('SELECT * FROM partner_requests WHERE id = ?').get(req.params.id);
  if (!pr) return res.status(404).json({ error: 'Не е намерено.' });
  if (pr.user_id !== req.user.id) return res.status(403).json({ error: 'Нямате права.' });
  db.prepare('UPDATE partner_requests SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Обявата е премахната.' });
});

// ─── MATCHES & RANKINGS ───────────────────────────────────────────────────────

// POST /api/matches  — record a match result
router.post('/matches', authenticate, (req, res) => {
  const { player2_id, player3_id, player4_id, club_id, date, score, winner_team, booking_id } = req.body;
  if (!player2_id || !date || !score || !winner_team) {
    return res.status(400).json({ error: 'Непълни данни за мача.' });
  }
  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO matches (id, player1_id, player2_id, player3_id, player4_id, club_id, date, score, winner_team, booking_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, player2_id, player3_id||null, player4_id||null, club_id||null, date, score, winner_team, booking_id||null);

  // update ratings (simple Elo-like update)
  const K = 32;
  const p1 = db.prepare('SELECT rating FROM users WHERE id = ?').get(req.user.id);
  const p2 = db.prepare('SELECT rating FROM users WHERE id = ?').get(player2_id);
  if (p1 && p2) {
    const expected1 = 1 / (1 + Math.pow(10, (p2.rating - p1.rating) / 400));
    const actual1 = winner_team === 1 ? 1 : 0;
    const delta = Math.round(K * (actual1 - expected1));
    db.prepare('UPDATE users SET rating = rating + ?, wins = wins + ?, losses = losses + ? WHERE id = ?')
      .run(delta, actual1 === 1 ? 1 : 0, actual1 === 1 ? 0 : 1, req.user.id);
    db.prepare('UPDATE users SET rating = rating + ?, wins = wins + ?, losses = losses + ? WHERE id = ?')
      .run(-delta, actual1 === 1 ? 0 : 1, actual1 === 1 ? 1 : 0, player2_id);
  }

  res.status(201).json({ id, message: 'Мачът е записан.' });
});

// GET /api/rankings?city=&level=
router.get('/rankings', (req, res) => {
  const db = getDb();
  const { city, level } = req.query;
  let query = `
    SELECT id, name, city, level, rating, wins, losses,
           CASE WHEN (wins+losses) > 0 THEN ROUND(wins*100.0/(wins+losses), 1) ELSE 0 END as win_rate
    FROM users WHERE role = 'player'
  `;
  const params = [];
  if (city) { query += ' AND city = ?'; params.push(city); }
  if (level) { query += ' AND level = ?'; params.push(level); }
  query += ' ORDER BY rating DESC LIMIT 100';
  res.json(db.prepare(query).all(...params));
});

// GET /api/players/:id  — public profile
router.get('/players/:id', (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT id, name, city, level, rating, wins, losses, avatar_url, created_at FROM users WHERE id = ?
  `).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Играчът не е намерен.' });

  const matches = db.prepare(`
    SELECT m.*, c.name as club_name FROM matches m
    LEFT JOIN clubs c ON m.club_id = c.id
    WHERE m.player1_id = ? OR m.player2_id = ? OR m.player3_id = ? OR m.player4_id = ?
    ORDER BY m.date DESC LIMIT 10
  `).all(req.params.id, req.params.id, req.params.id, req.params.id);

  res.json({ ...user, recent_matches: matches });
});

// GET /api/cities  — distinct cities with clubs
router.get('/cities', (req, res) => {
  const db = getDb();
  const cities = db.prepare("SELECT DISTINCT city FROM clubs WHERE approved = 1 ORDER BY city").all();
  res.json(cities.map(r => r.city));
});

module.exports = router;
