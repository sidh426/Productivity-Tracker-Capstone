// ── Dark mode toggle ──
const root       = document.documentElement;
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

// Set today as default due date
const today = new Date().toISOString().slice(0, 10);
document.getElementById('due-date-input').value = today;

// ── API helpers ──
async function api(method, path, body) {
    const res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

// ── State ──
let tasks       = [];
let activeFilter = 'all';

// ── Stats & Progress ──
async function loadStats() {
    try {
        const s = await api('GET', '/api/stats');
        document.getElementById('stat-total').textContent     = s.total;
        document.getElementById('stat-today-done').textContent = s.today_done;
        document.getElementById('stat-left').textContent      = s.total - s.done;
        document.getElementById('stat-streak').textContent    = s.streak;

        // Today's progress bar
        const card = document.getElementById('today-progress-card');
        if (s.today_total > 0) {
            card.style.display = 'block';
            const pct = Math.round((s.today_done / s.today_total) * 100);
            const fill = document.getElementById('progress-fill');
            fill.style.width = pct + '%';
            fill.classList.toggle('complete', pct === 100);
            document.getElementById('progress-label-text').textContent =
                `${s.today_done} of ${s.today_total} tasks done today`;
            document.getElementById('progress-pct').textContent = pct + '%';
        } else {
            card.style.display = 'none';
        }
    } catch(e) {
        console.error('Stats error:', e);
    }
}

// ── Task rendering ──
function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(dateStr) {
    if (!dateStr) return false;
    return dateStr < today;
}

function renderTasks() {
    const list     = document.getElementById('task-list');
    const emptyMsg = document.getElementById('empty-msg');

    // Clear task items
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

        const cb    = document.createElement('input');
        cb.type     = 'checkbox';
        cb.checked  = !!task.done;
        cb.addEventListener('change', async () => {
            await api('PATCH', `/api/tasks/${task.id}`, { done: cb.checked });
            await loadAll();
        });

        const label = document.createElement('span');
        label.className   = 'task-label';
        label.textContent = task.text;
        label.addEventListener('click', () => cb.click());

        const meta  = document.createElement('div');
        meta.className = 'task-meta';

        if (task.due_date) {
            const due = document.createElement('span');
            due.className = 'due-date' + (isOverdue(task.due_date) && !task.done ? ' overdue' : '');
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
            await api('DELETE', `/api/tasks/${task.id}`);
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
    tasks = await api('GET', '/api/tasks');
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
    const input   = document.getElementById('task-input');
    const text    = input.value.trim();
    if (!text) return;
    const category = document.getElementById('cat-select').value;
    const due_date = document.getElementById('due-date-input').value || null;
    await api('POST', '/api/tasks', { text, category, due_date });
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
            await api('POST', `/api/habits/${habit.id}/toggle`);
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
            await api('DELETE', `/api/habits/${habit.id}`);
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
    habits = await api('GET', '/api/habits');
    renderHabits();
}

document.getElementById('habit-form').addEventListener('submit', async e => {
    e.preventDefault();
    const input    = document.getElementById('habit-input');
    const name     = input.value.trim();
    if (!name) return;
    const category = document.getElementById('habit-cat-select').value;
    await api('POST', '/api/habits', { name, category });
    input.value = '';
    input.focus();
    await loadHabits();
});

// ── Load everything ──
async function loadAll() {
    await Promise.all([loadTasks(), loadStats()]);
}

loadAll();
loadHabits();
