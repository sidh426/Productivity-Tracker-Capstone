// ── Dark mode toggle ──
const root        = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');

function syncIcon() {
    themeToggle.textContent = root.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
}
syncIcon();
themeToggle.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('pt_theme', next); } catch(e) {}
    syncIcon();
});

// ── Date display ──
document.getElementById('date-display').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

const today = new Date().toISOString().slice(0, 10);
document.getElementById('due-date-input').value = today;

// ── Backend detection ──
// auth.js exposes isBackendAvailable() — we alias it here for clarity
let useBackend = false;

async function detectBackend() {
    useBackend = await isBackendAvailable();
}

// ── localStorage store (fallback) ──
const LS_TASKS  = 'pt_tasks_v2';
const LS_HABITS = 'pt_habits_v2';

function lsGetTasks()    { return JSON.parse(localStorage.getItem(LS_TASKS)  || '[]'); }
function lsSaveTasks(t)  { localStorage.setItem(LS_TASKS,  JSON.stringify(t)); }
function lsGetHabits()   { return JSON.parse(localStorage.getItem(LS_HABITS) || '[]'); }
function lsSaveHabits(h) { localStorage.setItem(LS_HABITS, JSON.stringify(h)); }

// ── Unified data layer ──
const Store = {
    async getTasks() {
        if (useBackend) {
            const r = await authFetch('/api/tasks'); return r.json();
        }
        return lsGetTasks();
    },

    async addTask(text, category, due_date) {
        if (useBackend) {
            const r = await authFetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, category, due_date })
            }); return r.json();
        }
        const tasks = lsGetTasks();
        const task  = { id: Date.now(), text, category, done: 0, due_date: due_date || null, created_at: today };
        tasks.push(task);
        lsSaveTasks(tasks);
        return task;
    },

    async toggleTask(id, done) {
        if (useBackend) {
            await authFetch(`/api/tasks/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ done })
            }); return;
        }
        const tasks = lsGetTasks();
        const t = tasks.find(x => x.id === id);
        if (t) { t.done = done ? 1 : 0; t.completed_at = done ? new Date().toISOString() : null; }
        lsSaveTasks(tasks);
    },

    async deleteTask(id) {
        if (useBackend) {
            await authFetch(`/api/tasks/${id}`, { method: 'DELETE' }); return;
        }
        lsSaveTasks(lsGetTasks().filter(x => x.id !== id));
    },

    async getStats() {
        if (useBackend) {
            const r = await authFetch('/api/stats'); return r.json();
        }
        const tasks  = lsGetTasks();
        const todayT = tasks.filter(t => t.due_date === today);
        const done   = tasks.filter(t => t.done);
        const todayD = todayT.filter(t => t.done);

        // Calculate streak from completion timestamps
        const days = [...new Set(
            done.map(t => t.completed_at ? t.completed_at.slice(0, 10) : null).filter(Boolean)
        )].sort().reverse();
        let streak = 0, check = today;
        for (const d of days) {
            if (d === check) {
                streak++;
                const dt = new Date(check);
                dt.setDate(dt.getDate() - 1);
                check = dt.toISOString().slice(0, 10);
            } else if (d < check) break;
        }
        return { total: tasks.length, done: done.length, today_total: todayT.length, today_done: todayD.length, streak };
    },

    async getHabits() {
        if (useBackend) {
            const r = await authFetch('/api/habits'); return r.json();
        }
        return lsGetHabits().map(h => {
            const completions = h.completions || [];
            const todayDone   = completions.includes(today);
            const sorted      = [...completions].sort().reverse();
            let streak = 0, check = today;
            for (const d of sorted) {
                if (d === check) {
                    streak++;
                    const dt = new Date(check);
                    dt.setDate(dt.getDate() - 1);
                    check = dt.toISOString().slice(0, 10);
                } else if (d < check) break;
            }
            return { ...h, today_done: todayDone, streak };
        });
    },

    async addHabit(name, category) {
        if (useBackend) {
            const r = await authFetch('/api/habits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, category })
            }); return r.json();
        }
        const habits = lsGetHabits();
        const h = { id: Date.now(), name, category, completions: [], created_at: today };
        habits.push(h);
        lsSaveHabits(habits);
        return h;
    },

    async toggleHabit(id) {
        if (useBackend) {
            const r = await authFetch(`/api/habits/${id}/toggle`, { method: 'POST' }); return r.json();
        }
        const habits = lsGetHabits();
        const h = habits.find(x => x.id === id);
        if (!h) return;
        const idx = (h.completions || []).indexOf(today);
        if (idx === -1) h.completions.push(today);
        else h.completions.splice(idx, 1);
        lsSaveHabits(habits);
        return { done: idx === -1 };
    },

    async deleteHabit(id) {
        if (useBackend) {
            await authFetch(`/api/habits/${id}`, { method: 'DELETE' }); return;
        }
        lsSaveHabits(lsGetHabits().filter(x => x.id !== id));
    }
};

// ── State ──
let tasks        = [];
let activeFilter = 'all';

// ── Stats & Progress ──
async function loadStats() {
    try {
        const s = await Store.getStats();
        document.getElementById('stat-total').textContent      = s.total;
        document.getElementById('stat-today-done').textContent = s.today_done;
        document.getElementById('stat-left').textContent       = s.total - s.done;
        document.getElementById('stat-streak').textContent     = s.streak;

        const card = document.getElementById('today-progress-card');
        if (s.today_total > 0) {
            card.style.display = 'block';
            const pct  = Math.round((s.today_done / s.today_total) * 100);
            const fill = document.getElementById('progress-fill');
            fill.style.width = pct + '%';
            fill.classList.toggle('complete', pct === 100);
            document.getElementById('progress-label-text').textContent =
                `${s.today_done} of ${s.today_total} tasks done today`;
            document.getElementById('progress-pct').textContent = pct + '%';
        } else {
            card.style.display = 'none';
        }
    } catch(e) { console.error('Stats error:', e); }
}

// ── Task rendering ──
function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function isOverdue(dateStr) { return dateStr && dateStr < today; }

function renderTasks() {
    const list     = document.getElementById('task-list');
    const emptyMsg = document.getElementById('empty-msg');

    Array.from(list.querySelectorAll('.task-item')).forEach(el => el.remove());

    const filtered = activeFilter === 'all'
        ? tasks
        : tasks.filter(t => t.category === activeFilter);

    emptyMsg.style.display = filtered.length === 0 ? 'block' : 'none';
    emptyMsg.textContent   = tasks.length === 0
        ? 'No tasks yet — add one above!'
        : `No ${activeFilter} tasks.`;

    filtered.forEach(task => {
        const li = document.createElement('li');
        li.className = 'task-item' + (task.done ? ' done' : '');
        if (task.category) li.dataset.category = task.category;

        const cb   = document.createElement('input');
        cb.type    = 'checkbox';
        cb.checked = !!task.done;
        cb.addEventListener('change', async () => {
            await Store.toggleTask(task.id, cb.checked);
            await loadAll();
        });

        const label = document.createElement('span');
        label.className   = 'task-label';
        label.textContent = task.text;
        label.addEventListener('click', () => cb.click());

        const meta = document.createElement('div');
        meta.className = 'task-meta';

        if (task.due_date) {
            const due = document.createElement('span');
            due.className   = 'due-date' + (isOverdue(task.due_date) && !task.done ? ' overdue' : '');
            due.textContent = formatDate(task.due_date);
            meta.appendChild(due);
        }

        const badge = document.createElement('span');
        badge.className   = `cat-badge cat-${task.category}`;
        badge.textContent = task.category;
        meta.appendChild(badge);

        const del = document.createElement('button');
        del.className = 'delete-btn';
        del.title     = 'Remove';
        del.innerHTML = '&#10005;';
        del.addEventListener('click', async () => {
            await Store.deleteTask(task.id);
            await loadAll();
        });

        li.appendChild(cb);
        li.appendChild(label);
        li.appendChild(meta);
        li.appendChild(del);
        list.appendChild(li);
    });
}

async function loadTasks() {
    tasks = await Store.getTasks();
    renderTasks();
}

// ── Filter tabs ──
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        activeFilter = btn.dataset.filter;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTasks();
    });
});

// ── Add task ──
document.getElementById('task-form').addEventListener('submit', async e => {
    e.preventDefault();
    const input    = document.getElementById('task-input');
    const text     = input.value.trim();
    if (!text) return;
    const category = document.getElementById('cat-select').value;
    const due_date = document.getElementById('due-date-input').value || null;
    await Store.addTask(text, category, due_date);
    input.value = '';
    input.focus();
    await loadAll();
});

// ── Habits ──
let habits = [];

function renderHabits() {
    const list     = document.getElementById('habit-list');
    const emptyMsg = document.getElementById('habit-empty-msg');

    Array.from(list.querySelectorAll('.habit-item')).forEach(el => el.remove());
    emptyMsg.style.display = habits.length === 0 ? 'block' : 'none';

    habits.forEach(habit => {
        const li = document.createElement('li');
        li.className = 'habit-item';
        li.dataset.category = habit.category;

        const check = document.createElement('button');
        check.className = 'habit-check' + (habit.today_done ? ' checked' : '');
        check.title     = habit.today_done ? 'Mark incomplete' : 'Mark complete';
        check.innerHTML = habit.today_done ? '✓' : '';
        check.addEventListener('click', async () => {
            await Store.toggleHabit(habit.id);
            await loadHabits();
            await loadStats();
        });

        const name = document.createElement('span');
        name.className   = 'habit-name';
        name.textContent = habit.name;

        const streak = document.createElement('span');
        streak.className   = 'habit-streak';
        streak.textContent = habit.streak > 0 ? `🔥 ${habit.streak}` : '';

        const badge = document.createElement('span');
        badge.className   = `cat-badge cat-${habit.category}`;
        badge.textContent = habit.category;

        const del = document.createElement('button');
        del.className = 'delete-btn';
        del.title     = 'Remove';
        del.innerHTML = '&#10005;';
        del.addEventListener('click', async () => {
            await Store.deleteHabit(habit.id);
            await loadHabits();
        });

        li.appendChild(check);
        li.appendChild(name);
        li.appendChild(streak);
        li.appendChild(badge);
        li.appendChild(del);
        list.appendChild(li);
    });
}

async function loadHabits() {
    habits = await Store.getHabits();
    renderHabits();
}

document.getElementById('habit-form').addEventListener('submit', async e => {
    e.preventDefault();
    const input    = document.getElementById('habit-input');
    const name     = input.value.trim();
    if (!name) return;
    const category = document.getElementById('habit-cat-select').value;
    await Store.addHabit(name, category);
    input.value = '';
    input.focus();
    await loadHabits();
});

// ── Load everything ──
async function loadAll() {
    await Promise.all([loadTasks(), loadStats()]);
}

(async () => {
    await detectBackend();
    if (useBackend) {
        // requireAuth() handles: redirect if no token, reveal body, show username + logout btn
        const authed = await requireAuth();
        if (!authed) return; // was redirected to login — stop here
    } else {
        // Static / localStorage mode — show a Sign in button in the nav
        const loginLink = document.getElementById('login-link');
        if (loginLink) loginLink.style.display = 'inline-flex';
        document.body.style.opacity = '1';
    }
    await loadAll();
    await loadHabits();
})();
