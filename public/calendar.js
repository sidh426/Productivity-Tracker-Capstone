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

// ── API helper ──
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
const now          = new Date();
let viewYear       = now.getFullYear();
let viewMonth      = now.getMonth(); // 0-indexed
let selectedDate   = null;           // 'YYYY-MM-DD'
let calendarData   = {};             // date -> { total, done }

// ── Helpers ──
function pad(n) { return String(n).padStart(2, '0'); }

function toDateStr(year, month, day) {
    return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function friendlyDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

// ── Load calendar dots for current view month ──
async function loadCalendarData() {
    const rows = await api('GET', `/api/tasks/calendar?year=${viewYear}&month=${viewMonth + 1}`);
    calendarData = {};
    rows.forEach(r => { calendarData[r.due_date] = { total: r.total, done: r.done }; });
}

// ── Render calendar grid ──
function renderCalendar() {
    const grid  = document.getElementById('calendar-grid');
    const label = document.getElementById('cal-month-label');

    // Remove day cells (keep headers)
    Array.from(grid.querySelectorAll('.cal-day')).forEach(el => el.remove());

    label.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
        month: 'long', year: 'numeric'
    });

    const firstDay  = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todayStr  = now.toISOString().slice(0, 10);

    // Leading blanks from previous month
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
        const cell = document.createElement('div');
        cell.className = 'cal-day other-month';
        cell.innerHTML = `<span class="cal-day-num">${prevMonthDays - i}</span>`;
        grid.appendChild(cell);
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = toDateStr(viewYear, viewMonth, d);
        const cell    = document.createElement('div');
        const classes = ['cal-day'];
        if (dateStr === todayStr)    classes.push('today');
        if (dateStr === selectedDate) classes.push('selected');
        cell.className = classes.join(' ');

        const num = document.createElement('span');
        num.className   = 'cal-day-num';
        num.textContent = d;
        cell.appendChild(num);

        // Task dots
        const info = calendarData[dateStr];
        if (info && info.total > 0) {
            const dots = document.createElement('div');
            dots.className = 'cal-dots';
            const count = Math.min(info.total, 4);
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

    // Update calendar highlight
    document.querySelectorAll('.cal-day.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.cal-day').forEach(el => {
        if (!el.classList.contains('other-month')) {
            const num = el.querySelector('.cal-day-num');
            if (num) {
                const [, , d] = dateStr.split('-');
                if (parseInt(num.textContent) === parseInt(d)) {
                    el.classList.add('selected');
                }
            }
        }
    });

    // Update panel title
    document.getElementById('day-panel-title').textContent = friendlyDate(dateStr);
    document.getElementById('day-placeholder').style.display = 'none';
    document.getElementById('day-task-form').style.display   = 'flex';
    document.getElementById('day-task-form').style.flexWrap  = 'wrap';

    await loadDayTasks(dateStr);
}

// ── Load tasks for selected day ──
async function loadDayTasks(dateStr) {
    const tasks    = await api('GET', `/api/tasks?date=${dateStr}`);
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
            await api('PATCH', `/api/tasks/${task.id}`, { done: cb.checked });
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
            await api('DELETE', `/api/tasks/${task.id}`);
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
    await api('POST', '/api/tasks', { text, category, due_date: selectedDate });
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

document.getElementById('cal-prev').addEventListener('click', () => changeMonth(-1));
document.getElementById('cal-next').addEventListener('click', () => changeMonth(1));
document.getElementById('cal-today').addEventListener('click', async () => {
    viewYear  = now.getFullYear();
    viewMonth = now.getMonth();
    await loadCalendarData();
    renderCalendar();
    await selectDay(now.toISOString().slice(0, 10));
});

// ── Init ──
(async () => {
    await loadCalendarData();
    renderCalendar();
    // Auto-select today
    await selectDay(now.toISOString().slice(0, 10));
})();
