# Productivity Tracker — Capstone (CMPA4404)

A full-stack habit and task management web application built as the CMPA4404 capstone project. This is a complete rebuild and evolution of my original [Productivity Tracker](https://github.com/sidh426/productivity-tracker-ui) — a project I built from scratch in CMPA4403 and became genuinely passionate about. The original proved how much could be done with just HTML, CSS, and vanilla JavaScript. This capstone takes that same foundation and pushes it further with a real backend, calendar planning, habit tracking, and cross-device persistence.

---

## Origin — productivity-tracker-ui

The foundation of this project is the original Productivity Tracker I built in CMPA4403. That version was a fully client-side app — no frameworks, no backend, no dependencies. Everything ran in the browser using:

- **HTML5 & CSS3** — structured layout and custom design system with CSS variables
- **Flexbox & CSS Grid** — responsive card-based layout that works on any screen size
- **Vanilla JavaScript** — all interactivity written from scratch, no libraries
- **localStorage API** — tasks saved in the browser so they persisted between visits
- **Dark mode** — theme toggle with an anti-flash inline script to apply the saved preference before the first paint, preventing a flicker on load

That project taught me how to manage state without a framework, re-render the DOM efficiently on every change, and build a polished UI from scratch. The trickiest part was layering category filtering on top of the task list without losing track of each item's real index in the underlying array — something that required careful thought about how the data and the DOM stay in sync.

This capstone keeps that same design language and builds on top of it.

---

## What's New in the Capstone

| Feature | Original (CMPA4403) | Capstone (CMPA4404) |
|---|---|---|
| Storage | Browser localStorage only | SQLite database via backend |
| Cross-device | No | Yes — data lives on the server |
| Calendar | No | Full monthly planning view |
| Habit tracking | No | Daily habits with streak counters |
| Due dates | No | Tasks can be scheduled to any date |
| Progress tracking | Basic counts | Progress bar + day streak stat |
| Categories | 3 (School, Work, Personal) | 4 (+ Health) |
| Architecture | Frontend only | Full-stack (Node.js + Express + SQLite) |

---

## Tech Stack

### Backend
- **Node.js** — JavaScript runtime for the server
- **Express** — lightweight web framework handling the REST API and static file serving
- **better-sqlite3** — fast, synchronous SQLite driver; no separate database server required, data is stored in a local `.db` file

### Frontend
- **HTML5 / CSS3** — same semantic structure and design system as the original, extended with new components (calendar grid, habit list, progress bar, day panel)
- **CSS Custom Properties (variables)** — full light/dark theme system with smooth transitions, shared across all pages via one `styles.css`
- **Vanilla JavaScript** — no frontend framework; `app.js` and `calendar.js` communicate with the backend via the `fetch` API
- **CSS Grid** — used for both the stats row and the 7-column calendar grid
- **Flexbox** — task items, forms, nav bar, and day panel layout

### API
The server exposes a REST API consumed by the frontend:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tasks` | Get all tasks (optional `?date=` filter) |
| `GET` | `/api/tasks/calendar` | Get task counts per day for a month |
| `POST` | `/api/tasks` | Create a task |
| `PATCH` | `/api/tasks/:id` | Update a task (done, text, category, due date) |
| `DELETE` | `/api/tasks/:id` | Delete a task |
| `GET` | `/api/habits` | Get all habits with today's status and streak |
| `POST` | `/api/habits` | Create a habit |
| `DELETE` | `/api/habits/:id` | Delete a habit |
| `POST` | `/api/habits/:id/toggle` | Toggle today's completion for a habit |
| `GET` | `/api/stats` | Get overall stats and current day streak |

---

## Features

- **Dashboard** — today's tasks, overall stats, day streak, and daily progress bar
- **Calendar** — monthly grid view with colored dots showing task load per day; click any day to view or add tasks for that date
- **Habit Tracker** — separate list of recurring daily habits, each with a per-habit fire streak counter showing consecutive days completed
- **Due Dates** — tasks can be assigned to any date; overdue incomplete tasks are highlighted in red
- **Category Filtering** — School, Work, Personal, Health — each color-coded; filterable on the dashboard
- **Day Streak** — global stat counting consecutive days where at least one task was completed
- **Dark Mode** — full dark theme with the same anti-flash technique from the original project

---

## Running Locally

```bash
# Install dependencies
npm install

# Start the server
node server.js
```

Open `http://localhost:3000` in your browser. The SQLite database file (`tracker.db`) is created automatically on first run.

---

## Project Structure

```
Productivity-Tracker-Capstone/
├── server.js          # Express server + SQLite setup + all API routes
├── package.json
└── public/            # Static files served by Express
    ├── index.html     # Dashboard page
    ├── calendar.html  # Calendar planning page
    ├── about.html     # About page
    ├── styles.css     # Shared design system (light + dark theme)
    ├── app.js         # Dashboard JavaScript (tasks, habits, stats)
    └── calendar.js    # Calendar JavaScript (grid, day panel, navigation)
```
