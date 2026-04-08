const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { email, password, name, phone, city, level, role } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Имейл, парола и ime са задължителни.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Паролата трябва да е поне 6 символа.' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'Вече съществува акаунт с този имейл.' });
  }

  const allowedRoles = ['player', 'club_admin'];
  const userRole = allowedRoles.includes(role) ? role : 'player';

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, phone, city, level, role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, email.toLowerCase(), hash, name, phone || null, city || null, level || 'beginner', userRole);

  const token = jwt.sign({ id, email: email.toLowerCase(), role: userRole }, process.env.JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({ token, user: { id, email: email.toLowerCase(), name, role: userRole, city, level: level || 'beginner' } });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Имейл и парола са задължителни.' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Грешен имейл или парола.' });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, city: user.city, level: user.level, rating: user.rating }
  });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, name, phone, city, level, role, rating, wins, losses, avatar_url, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Потребителят не е намерен.' });
  res.json(user);
});

// PUT /api/auth/me
router.put('/me', authenticate, (req, res) => {
  const { name, phone, city, level, avatar_url } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone),
    city = COALESCE(?, city), level = COALESCE(?, level), avatar_url = COALESCE(?, avatar_url)
    WHERE id = ?
  `).run(name || null, phone || null, city || null, level || null, avatar_url || null, req.user.id);
  res.json({ message: 'Профилът е обновен успешно.' });
});

module.exports = router;
