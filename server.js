const express = require('express');
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'pt-capstone-secret-key-change-in-production';

// ── Database setup (Neon PostgreSQL) ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create tables on startup if they don't exist
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text         TEXT NOT NULL,
      category     TEXT NOT NULL DEFAULT 'personal',
      done         BOOLEAN NOT NULL DEFAULT FALSE,
      due_date     DATE,
      created_at   DATE NOT NULL DEFAULT CURRENT_DATE,
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS habits (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      category   TEXT NOT NULL DEFAULT 'personal',
      created_at DATE NOT NULL DEFAULT CURRENT_DATE
    );

    CREATE TABLE IF NOT EXISTS habit_completions (
      id             SERIAL PRIMARY KEY,
      habit_id       INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      completed_date DATE NOT NULL,
      UNIQUE(habit_id, completed_date)
    );
  `);
  console.log('Database ready');
}

initDB().catch(err => {
  console.error('Database init failed:', err.message);
});

// ── CORS — allow GitHub Pages and localhost ──
const ALLOWED_ORIGINS = [
  'https://sidh426.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Middleware ──
app.use(express.json());
app.use(express.static(path.join(__dirname, 'docs')));

// ── Auth middleware ──
function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    req.user = jwt.verify(header.slice(7), SECRET);
    next();
  } catch(e) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Auth Routes ──

// POST /api/register
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'username, email and password are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const exists = await pool.query(
      'SELECT id FROM users WHERE email=$1 OR username=$2',
      [email.trim().toLowerCase(), username.trim()]
    );
    if (exists.rows.length > 0)
      return res.status(409).json({ error: 'Username or email already taken' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username',
      [username.trim(), email.trim().toLowerCase(), hash]
    );
    const user  = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, username: user.username });
  } catch(e) {
    console.error('Register error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'email and password are required' });

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email=$1',
      [email.trim().toLowerCase()]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '30d' });
    res.json({ token, username: user.username });
  } catch(e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/me
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Task Routes ──

app.get('/api/tasks', requireAuth, async (req, res) => {
  try {
    const { date } = req.query;
    if (date) {
      const r = await pool.query(
        'SELECT * FROM tasks WHERE user_id=$1 AND due_date=$2 ORDER BY created_at DESC',
        [req.user.id, date]
      );
      return res.json(r.rows);
    }
    const r = await pool.query(
      'SELECT * FROM tasks WHERE user_id=$1 ORDER BY due_date ASC NULLS LAST, created_at DESC',
      [req.user.id]
    );
    res.json(r.rows);
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/tasks/calendar', requireAuth, async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'year and month required' });
    const r = await pool.query(
      `SELECT due_date::text, COUNT(*) as total, SUM(CASE WHEN done THEN 1 ELSE 0 END) as done
       FROM tasks
       WHERE user_id=$1
         AND EXTRACT(YEAR FROM due_date)=$2
         AND EXTRACT(MONTH FROM due_date)=$3
       GROUP BY due_date`,
      [req.user.id, year, month]
    );
    res.json(r.rows);
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/tasks', requireAuth, async (req, res) => {
  try {
    const { text, category = 'personal', due_date } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
    const r = await pool.query(
      'INSERT INTO tasks (user_id, text, category, due_date) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, text.trim(), category, due_date || null]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const existing = await pool.query(
      'SELECT * FROM tasks WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'not found' });
    const task = existing.rows[0];

    const { done, text, category, due_date } = req.body;
    const newDone     = done     !== undefined ? done             : task.done;
    const newText     = text     !== undefined ? text.trim()      : task.text;
    const newCategory = category !== undefined ? category         : task.category;
    const newDueDate  = due_date !== undefined ? due_date         : task.due_date;
    const completedAt = newDone && !task.done ? new Date().toISOString()
                      : newDone ? task.completed_at : null;

    const r = await pool.query(
      `UPDATE tasks SET done=$1, text=$2, category=$3, due_date=$4, completed_at=$5
       WHERE id=$6 AND user_id=$7 RETURNING *`,
      [newDone, newText, newCategory, newDueDate, completedAt, req.params.id, req.user.id]
    );
    res.json(r.rows[0]);
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'DELETE FROM tasks WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Habit Routes ──

app.get('/api/habits', requireAuth, async (req, res) => {
  try {
    const today  = new Date().toISOString().slice(0, 10);
    const habits = (await pool.query(
      'SELECT * FROM habits WHERE user_id=$1 ORDER BY created_at ASC',
      [req.user.id]
    )).rows;

    const result = await Promise.all(habits.map(async h => {
      const todayDone = (await pool.query(
        'SELECT 1 FROM habit_completions WHERE habit_id=$1 AND completed_date=$2',
        [h.id, today]
      )).rows.length > 0;

      const completions = (await pool.query(
        'SELECT completed_date::text FROM habit_completions WHERE habit_id=$1 ORDER BY completed_date DESC',
        [h.id]
      )).rows.map(r => r.completed_date);

      let streak = 0, check = today;
      for (const date of completions) {
        if (date === check) {
          streak++;
          const d = new Date(check);
          d.setDate(d.getDate() - 1);
          check = d.toISOString().slice(0, 10);
        } else break;
      }
      return { ...h, today_done: todayDone, streak };
    }));

    res.json(result);
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/habits', requireAuth, async (req, res) => {
  try {
    const { name, category = 'personal' } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    const r = await pool.query(
      'INSERT INTO habits (user_id, name, category) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, name.trim(), category]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/habits/:id', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'DELETE FROM habits WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/habits/:id/toggle', requireAuth, async (req, res) => {
  try {
    const habit = await pool.query(
      'SELECT id FROM habits WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!habit.rows[0]) return res.status(404).json({ error: 'not found' });

    const today = new Date().toISOString().slice(0, 10);
    const existing = await pool.query(
      'SELECT id FROM habit_completions WHERE habit_id=$1 AND completed_date=$2',
      [req.params.id, today]
    );

    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM habit_completions WHERE id=$1', [existing.rows[0].id]);
      return res.json({ done: false });
    }
    await pool.query(
      'INSERT INTO habit_completions (habit_id, completed_date) VALUES ($1, $2)',
      [req.params.id, today]
    );
    res.json({ done: true });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Stats Route ──
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const uid   = req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const [todayTotal, todayDone, total, done, completedDays] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND due_date=$2', [uid, today]),
      pool.query('SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND due_date=$2 AND done=true', [uid, today]),
      pool.query('SELECT COUNT(*) FROM tasks WHERE user_id=$1', [uid]),
      pool.query('SELECT COUNT(*) FROM tasks WHERE user_id=$1 AND done=true', [uid]),
      pool.query(
        `SELECT DISTINCT DATE(completed_at)::text as day FROM tasks
         WHERE user_id=$1 AND completed_at IS NOT NULL ORDER BY day DESC`,
        [uid]
      )
    ]);

    let streak = 0, check = today;
    for (const { day } of completedDays.rows) {
      if (day === check) {
        streak++;
        const d = new Date(check);
        d.setDate(d.getDate() - 1);
        check = d.toISOString().slice(0, 10);
      } else if (day < check) break;
    }

    res.json({
      today_total: parseInt(todayTotal.rows[0].count),
      today_done:  parseInt(todayDone.rows[0].count),
      total:       parseInt(total.rows[0].count),
      done:        parseInt(done.rows[0].count),
      streak
    });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Fallback ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'login.html'));
});

app.listen(PORT, () => console.log(`Productivity Tracker running at http://localhost:${PORT}`));
