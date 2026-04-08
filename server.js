const express = require('express');
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'pt-capstone-secret-key-change-in-production';

// ── Database setup ──
const db = new Database(path.join(__dirname, 'tracker.db'));
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text         TEXT    NOT NULL,
    category     TEXT    NOT NULL DEFAULT 'personal',
    done         INTEGER NOT NULL DEFAULT 0,
    due_date     TEXT,
    created_at   TEXT    NOT NULL DEFAULT (date('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS habits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    category   TEXT    NOT NULL DEFAULT 'personal',
    created_at TEXT    NOT NULL DEFAULT (date('now'))
  );

  CREATE TABLE IF NOT EXISTS habit_completions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id       INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    completed_date TEXT    NOT NULL,
    UNIQUE(habit_id, completed_date)
  );
`);

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

  const exists = db.prepare('SELECT id FROM users WHERE email=? OR username=?').get(email, username);
  if (exists) return res.status(409).json({ error: 'Username or email already taken' });

  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  ).run(username.trim(), email.trim().toLowerCase(), hash);

  const token = jwt.sign({ id: info.lastInsertRowid, username }, SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, username });
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username });
});

// GET /api/me — verify token and return user info
app.get('/api/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, email, created_at FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ── Task Routes (all protected) ──

app.get('/api/tasks', requireAuth, (req, res) => {
  const { date } = req.query;
  if (date) {
    return res.json(
      db.prepare('SELECT * FROM tasks WHERE user_id=? AND due_date=? ORDER BY created_at DESC')
        .all(req.user.id, date)
    );
  }
  res.json(
    db.prepare('SELECT * FROM tasks WHERE user_id=? ORDER BY due_date ASC, created_at DESC')
      .all(req.user.id)
  );
});

app.get('/api/tasks/calendar', requireAuth, (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  res.json(
    db.prepare(`
      SELECT due_date, COUNT(*) as total, SUM(done) as done
      FROM tasks WHERE user_id=? AND due_date LIKE ?
      GROUP BY due_date
    `).all(req.user.id, `${prefix}%`)
  );
});

app.post('/api/tasks', requireAuth, (req, res) => {
  const { text, category = 'personal', due_date } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
  const info = db.prepare(
    'INSERT INTO tasks (user_id, text, category, due_date) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, text.trim(), category, due_date || null);
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id=?').get(info.lastInsertRowid));
});

app.patch('/api/tasks/:id', requireAuth, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'not found' });

  const { done, text, category, due_date } = req.body;
  const newDone     = done     !== undefined ? (done ? 1 : 0) : task.done;
  const newText     = text     !== undefined ? text.trim()    : task.text;
  const newCategory = category !== undefined ? category       : task.category;
  const newDueDate  = due_date !== undefined ? due_date       : task.due_date;
  const completedAt = newDone && !task.done ? new Date().toISOString() : (newDone ? task.completed_at : null);

  db.prepare(`
    UPDATE tasks SET done=?, text=?, category=?, due_date=?, completed_at=? WHERE id=? AND user_id=?
  `).run(newDone, newText, newCategory, newDueDate, completedAt, req.params.id, req.user.id);

  res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id));
});

app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ── Habit Routes (all protected) ──

app.get('/api/habits', requireAuth, (req, res) => {
  const today  = new Date().toISOString().slice(0, 10);
  const habits = db.prepare('SELECT * FROM habits WHERE user_id=? ORDER BY created_at ASC').all(req.user.id);

  const result = habits.map(h => {
    const todayDone = !!db.prepare(
      'SELECT 1 FROM habit_completions WHERE habit_id=? AND completed_date=?'
    ).get(h.id, today);

    const completions = db.prepare(
      'SELECT completed_date FROM habit_completions WHERE habit_id=? ORDER BY completed_date DESC'
    ).all(h.id).map(r => r.completed_date);

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
  });

  res.json(result);
});

app.post('/api/habits', requireAuth, (req, res) => {
  const { name, category = 'personal' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  const info = db.prepare(
    'INSERT INTO habits (user_id, name, category) VALUES (?, ?, ?)'
  ).run(req.user.id, name.trim(), category);
  res.status(201).json(db.prepare('SELECT * FROM habits WHERE id=?').get(info.lastInsertRowid));
});

app.delete('/api/habits/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM habits WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

app.post('/api/habits/:id/toggle', requireAuth, (req, res) => {
  const habit = db.prepare('SELECT id FROM habits WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!habit) return res.status(404).json({ error: 'not found' });

  const today    = new Date().toISOString().slice(0, 10);
  const existing = db.prepare(
    'SELECT id FROM habit_completions WHERE habit_id=? AND completed_date=?'
  ).get(req.params.id, today);

  if (existing) {
    db.prepare('DELETE FROM habit_completions WHERE id=?').run(existing.id);
    return res.json({ done: false });
  }
  db.prepare('INSERT INTO habit_completions (habit_id, completed_date) VALUES (?, ?)').run(req.params.id, today);
  res.json({ done: true });
});

// ── Stats Route (protected) ──
app.get('/api/stats', requireAuth, (req, res) => {
  const uid   = req.user.id;
  const today = new Date().toISOString().slice(0, 10);

  const todayTasks = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND due_date=?').get(uid, today);
  const todayDone  = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND due_date=? AND done=1').get(uid, today);
  const totalTasks = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE user_id=?').get(uid);
  const doneTasks  = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE user_id=? AND done=1').get(uid);

  const completedDays = db.prepare(`
    SELECT DISTINCT date(completed_at) as day
    FROM tasks WHERE user_id=? AND completed_at IS NOT NULL
    ORDER BY day DESC
  `).all(uid).map(r => r.day);

  let streak = 0, check = today;
  for (const day of completedDays) {
    if (day === check) {
      streak++;
      const d = new Date(check);
      d.setDate(d.getDate() - 1);
      check = d.toISOString().slice(0, 10);
    } else if (day < check) break;
  }

  res.json({ today_total: todayTasks.n, today_done: todayDone.n, total: totalTasks.n, done: doneTasks.n, streak });
});

// ── Fallback — send login page for unknown routes ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

app.listen(PORT, () => console.log(`Productivity Tracker running at http://localhost:${PORT}`));
