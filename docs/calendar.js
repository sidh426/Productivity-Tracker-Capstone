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

// ── Backend detection ──
let useBackend = false;

function useAPI() { return useBackend && !isGuestMode(); }

async function detectBackend() {
    useBackend = await isBackendAvailable();
}

// ── localStorage helpers ──
const LS_TASKS = 'pt_tasks_v2';
function lsGetTasks()   { return JSON.parse(localStorage.getItem(LS_TASKS) || '[]'); }
function lsSaveTasks(t) { localStorage.setItem(LS_TASKS, JSON.stringify(t)); }

// ── Unified data layer ──
const Store = {
    async getTasksByDate(dateStr) {
        if (useAPI()) {
            const r = await authFetch(`/api/tasks?date=${dateStr}`); return r.json();
        }
        return lsGetTasks().filter(t => t.due_date === dateStr);
    },

    async getCalendarData(year, month) {
        if (useAPI()) {
            const r = await authFetch(`/api/tasks/calendar?year=${year}&month=${month}`); return r.json();
        }
        const prefix = `${year}-${String(month).padStart(2, '0')}`;
        const tasks  = lsGetTasks().filter(t => t.due_date && t.due_date.startsWith(prefix));
        const map    = {};
        tasks.forEach(t => {
            if (!map[t.due_date]) map[t.due_date] = { due_date: t.due_date, total: 0, done: 0 };
            map[t.due_date].total++;
            if (t.done) map[t.due_date].done++;
        });
        return Object.values(map);
    },

    async addTask(text, category, due_date) {
        if (useAPI()) {
            const r = await authFetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, category, due_date })
            }); return r.json();
        }
        const tasks = lsGetTasks();
        const task  = { id: Date.now(), text, category, done: 0, due_date, created_at: due_date };
        tasks.push(task);
        lsSaveTasks(tasks);
        return task;
    },

    async toggleTask(id, done) {
        if (useAPI()) {
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
        if (useAPI()) {
            await authFetch(`/api/tasks/${id}`, { method: 'DELETE' }); return;
        }
        lsSaveTasks(lsGetTasks().filter(x => x.id !== id));
    }
};

// ── State ──
const now        = new Date();
let viewYear     = now.getFullYear();
let viewMonth    = now.getMonth(); // 0-indexed
let selectedDate = null;
let calendarData = {};

// ── Helpers ──
function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(year, month, day) { return `${year}-${pad(month + 1)}-${pad(day)}`; }
function friendlyDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

// ── Load calendar dots for current view month ──
async function loadCalendarData() {
    const rows = await Store.getCalendarData(viewYear, viewMonth + 1);
    calendarData = {};
    rows.forEach(r => { calendarData[r.due_date] = { total: r.total, done: r.done }; });
}

// ── Render calendar grid ──
function renderCalendar() {
    const grid  = document.getElementById('calendar-grid');
    const label = document.getElementById('cal-month-label');

    Array.from(grid.querySelectorAll('.cal-day')).forEach(el => el.remove());

    label.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
        month: 'long', year: 'numeric'
    });

    const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todayStr    = now.toISOString().slice(0, 10);
    const prevDays    = new Date(viewYear, viewMonth, 0).getDate();

    // Leading blanks
    for (let i = firstDay - 1; i >= 0; i--) {
        const cell = document.createElement('div');
        cell.className = 'cal-day other-month';
        cell.innerHTML = `<span class="cal-day-num">${prevDays - i}</span>`;
        grid.appendChild(cell);
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = toDateStr(viewYear, viewMonth, d);
        const cell    = document.createElement('div');
        const classes = ['cal-day'];
        if (dateStr === todayStr)     classes.push('today');
        if (dateStr === selectedDate) classes.push('selected');
        cell.className = classes.join(' ');

        const num = document.createElement('span');
        num.className   = 'cal-day-num';
        num.textContent = d;
        cell.appendChild(num);

        const info = calendarData[dateStr];
        if (info && info.total > 0) {
            const dots  = document.createElement('div');
            dots.className = 'cal-dots';
            const count   = Math.min(info.total, 4);
            const allDone = info.done >= info.total;
            for (let i = 0; i < count; i++) {
                const dot = document.createElement('span');
                if (allDone) dot.className = 'done';
                dots.appendChild(dot);
            }
            cell.appendChild(dots);
        }

        cell.addEventListener('click', () => selectDay(dateStr));
        grid.appendChild(cell);
    }

    // Trailing blanks
    const totalCells = firstDay + daysInMonth;
    const trailing   = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= trailing; d++) {
        const cell = document.createElement('div');
        cell.className = 'cal-day other-month';
        cell.innerHTML = `<span class="cal-day-num">${d}</span>`;
        grid.appendChild(cell);
    }
}

// ── Select a day ──
async function selectDay(dateStr) {
    selectedDate = dateStr;

    document.querySelectorAll('.cal-day').forEach(el => {
        if (el.classList.contains('other-month')) return;
        const num = el.querySelector('.cal-day-num');
        const [, , d] = dateStr.split('-');
        el.classList.toggle('selected', num && parseInt(num.textContent) === parseInt(d));
    });

    document.getElementById('day-panel-title').textContent    = friendlyDate(dateStr);
    document.getElementById('day-placeholder').style.display  = 'none';
    document.getElementById('day-task-form').style.display    = 'flex';
    document.getElementById('day-task-form').style.flexWrap   = 'wrap';

    await loadDayTasks(dateStr);
}

// ── Load tasks for selected day ──
async function loadDayTasks(dateStr) {
    const tasks    = await Store.getTasksByDate(dateStr);
    const list     = document.getElementById('day-task-list');
    const emptyMsg = document.getElementById('day-empty-msg');

    Array.from(list.querySelectorAll('.task-item')).forEach(el => el.remove());
    emptyMsg.style.display = tasks.length === 0 ? 'block' : 'none';

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'task-item' + (task.done ? ' done' : '');
        if (task.category) li.dataset.category = task.category;

        const cb   = document.createElement('input');
        cb.type    = 'checkbox';
        cb.checked = !!task.done;
        cb.addEventListener('change', async () => {
            await Store.toggleTask(task.id, cb.checked);
            await refreshAfterChange();
        });

        const label = document.createElement('span');
        label.className   = 'task-label';
        label.textContent = task.text;
        label.addEventListener('click', () => cb.click());

        const badge = document.createElement('span');
        badge.className   = `cat-badge cat-${task.category}`;
        badge.textContent = task.category;

        const del = document.createElement('button');
        del.className = 'delete-btn';
        del.title     = 'Remove';
        del.innerHTML = '&#10005;';
        del.addEventListener('click', async () => {
            await Store.deleteTask(task.id);
            await refreshAfterChange();
        });

        li.appendChild(cb);
        li.appendChild(label);
        li.appendChild(badge);
        li.appendChild(del);
        list.appendChild(li);
    });
}

async function refreshAfterChange() {
    await loadCalendarData();
    renderCalendar();
    if (selectedDate) await loadDayTasks(selectedDate);
}

// ── Add task for selected day ──
document.getElementById('day-task-form').addEventListener('submit', async e => {
    e.preventDefault();
    const input    = document.getElementById('day-task-input');
    const text     = input.value.trim();
    if (!text || !selectedDate) return;
    const category = document.getElementById('day-cat-select').value;
    await Store.addTask(text, category, selectedDate);
    input.value = '';
    input.focus();
    await refreshAfterChange();
});

// ── Navigation ──
async function changeMonth(delta) {
    viewMonth += delta;
    if (viewMonth < 0)  { viewMonth = 11; viewYear--; }
    if (viewMonth > 11) { viewMonth = 0;  viewYear++; }
    await loadCalendarData();
    renderCalendar();
}

document.getElementById('cal-prev').addEventListener('click',  () => changeMonth(-1));
document.getElementById('cal-next').addEventListener('click',  () => changeMonth(1));
document.getElementById('cal-today').addEventListener('click', async () => {
    viewYear  = now.getFullYear();
    viewMonth = now.getMonth();
    await loadCalendarData();
    renderCalendar();
    await selectDay(now.toISOString().slice(0, 10));
});

// ── Init ──
(async () => {
    await detectBackend();
    if (useAPI()) {
        const authed = await requireAuth();
        if (!authed && !isGuestMode()) return;
    } else {
        const loginLink = document.getElementById('login-link');
        if (loginLink) loginLink.style.display = 'inline-flex';
        document.body.style.opacity = '1';
    }
    await loadCalendarData();
    renderCalendar();
    await selectDay(now.toISOString().slice(0, 10));
})();
