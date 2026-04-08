const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database setup ──
const db = new Database(path.join(__dirname, 'tracker.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    text        TEXT    NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'personal',
    done        INTEGER NOT NULL DEFAULT 0,
    due_date    TEXT,
    created_at  TEXT    NOT NULL DEFAULT (date('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS habits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'personal',
    created_at  TEXT    NOT NULL DEFAULT (date('now'))
  );

  CREATE TABLE IF NOT EXISTS habit_completions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id     INTEGER NOT NULL,
    completed_date TEXT  NOT NULL,
    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
    UNIQUE(habit_id, completed_date)
  );
`);

// ── Middleware ──
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Task Routes ──

// GET all tasks (optionally filtered by due_date)
app.get('/api/tasks', (req, res) => {
  const { date } = req.query;
  if (date) {
    const tasks = db.prepare('SELECT * FROM tasks WHERE due_date = ? ORDER BY created_at DESC').all(date);
    return res.json(tasks);
  }
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY due_date ASC, created_at DESC').all();
  res.json(tasks);
});

// GET tasks grouped by date (for calendar dots)
app.get('/api/tasks/calendar', (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const rows = db.prepare(`
    SELECT due_date, COUNT(*) as total, SUM(done) as done
    FROM tasks
    WHERE due_date LIKE ?
    GROUP BY due_date
  `).all(`${prefix}%`);
  res.json(rows);
});

// POST create task
app.post('/api/tasks', (req, res) => {
  const { text, category = 'personal', due_date } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
  const stmt = db.prepare('INSERT INTO tasks (text, category, due_date) VALUES (?, ?, ?)');
  const info = stmt.run(text.trim(), category, due_date || null);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(task);
});

// PATCH update task
app.patch('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { done, text, category, due_date } = req.body;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ error: 'not found' });

  const newDone     = done     !== undefined ? (done ? 1 : 0) : task.done;
  const newText     = text     !== undefined ? text.trim() : task.text;
  const newCategory = category !== undefined ? category : task.category;
  const newDueDate  = due_date !== undefined ? due_date : task.due_date;
  const completedAt = newDone && !task.done ? new Date().toISOString() : (newDone ? task.completed_at : null);

  db.prepare(`
    UPDATE tasks SET done=?, text=?, category=?, due_date=?, completed_at=? WHERE id=?
  `).run(newDone, newText, newCategory, newDueDate, completedAt, id);

  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
});

// DELETE task
app.delete('/api/tasks/:id', (req, res) => {
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ── Habit Routes ──

// GET all habits with today's completion status and streak
app.get('/api/habits', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const habits = db.prepare('SELECT * FROM habits ORDER BY created_at ASC').all();

  const result = habits.map(h => {
    const todayDone = !!db.prepare(
      'SELECT 1 FROM habit_completions WHERE habit_id=? AND completed_date=?'
    ).get(h.id, today);

    // Calculate current streak
    const completions = db.prepare(
      'SELECT completed_date FROM habit_completions WHERE habit_id=? ORDER BY completed_date DESC'
    ).all(h.id).map(r => r.completed_date);

    let streak = 0;
    let check = today;
    for (const date of completions) {
      if (date === check) {
        streak++;
        const d = new Date(check);
        d.setDate(d.getDate() - 1);
        check = d.toISOString().slice(0, 10);
      } else {
        break;
      }
    }

    return { ...h, today_done: todayDone, streak };
  });

  res.json(result);
});

// POST create habit
app.post('/api/habits', (req, res) => {
  const { name, category = 'personal' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  const info = db.prepare('INSERT INTO habits (name, category) VALUES (?, ?)').run(name.trim(), category);
  res.status(201).json(db.prepare('SELECT * FROM habits WHERE id = ?').get(info.lastInsertRowid));
});

// DELETE habit
app.delete('/api/habits/:id', (req, res) => {
  const info = db.prepare('DELETE FROM habits WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// POST toggle habit completion for today
app.post('/api/habits/:id/toggle', (req, res) => {
  const { id } = req.params;
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare(
    'SELECT id FROM habit_completions WHERE habit_id=? AND completed_date=?'
  ).get(id, today);

  if (existing) {
    db.prepare('DELETE FROM habit_completions WHERE id=?').run(existing.id);
    return res.json({ done: false });
  } else {
    db.prepare('INSERT INTO habit_completions (habit_id, completed_date) VALUES (?, ?)').run(id, today);
    return res.json({ done: true });
  }
});

// ── Stats Route ──
app.get('/api/stats', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const todayTasks = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE due_date=?').get(today);
  const todayDone  = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE due_date=? AND done=1').get(today);
  const totalTasks = db.prepare('SELECT COUNT(*) as n FROM tasks').get();
  const doneTasks  = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE done=1').get();

  // Streak: consecutive days with at least one task completed
  const completedDays = db.prepare(`
    SELECT DISTINCT date(completed_at) as day
    FROM tasks WHERE completed_at IS NOT NULL
    ORDER BY day DESC
  `).all().map(r => r.day);

  let streak = 0;
  let check = today;
  for (const day of completedDays) {
    if (day === check) {
      streak++;
      const d = new Date(check);
      d.setDate(d.getDate() - 1);
      check = d.toISOString().slice(0, 10);
    } else if (day < check) {
      break;
    }
  }

  res.json({
    today_total: todayTasks.n,
    today_done:  todayDone.n,
    total:       totalTasks.n,
    done:        doneTasks.n,
    streak
  });
});

// ── Fallback ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Productivity Tracker running at http://localhost:${PORT}`);
});
