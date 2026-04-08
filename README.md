# Productivity Tracker — Capstone (CMPA4404)

A full-stack habit and task management web application built as the CMPA4404 capstone project. This is a complete rebuild and evolution of my original [Productivity Tracker](https://github.com/sidh426/productivity-tracker-ui) — a project I built from scratch in CMPA4403 and became genuinely passionate about. The original proved how much could be done with just HTML, CSS, and vanilla JavaScript. This capstone takes that same foundation and pushes it further with a real backend, user accounts, calendar planning, habit tracking, and cross-device persistence.

**Live sites:**
- 🌐 **GitHub Pages (static demo):** https://sidh426.github.io/Productivity-Tracker-Capstone/
- 🚀 **Render (full backend + accounts):** https://productivity-tracker-capstone.onrender.com

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
| User accounts | No | Yes — register, login, JWT auth |
| Cross-device sync | No | Yes — any device, any network |
| Calendar | No | Full monthly planning view |
| Habit tracking | No | Daily habits with streak counters |
| Due dates | No | Tasks can be scheduled to any date |
| Progress tracking | Basic counts | Progress bar + day streak stat |
| Categories | 3 (School, Work, Personal) | 4 (+ Health) |
| Architecture | Frontend only | Full-stack (Node.js + Express + SQLite) |
| Hosting | GitHub Pages | GitHub Pages + Render |

---

## Tech Stack

### Backend
- **Node.js** — JavaScript runtime for the server
- **Express** — lightweight web framework handling the REST API and static file serving
- **better-sqlite3** — fast, synchronous SQLite driver; no separate database server required, data is stored in a local `.db` file
- **bcryptjs** — hashes user passwords before storing them; the raw password is never saved
- **jsonwebtoken (JWT)** — issues a signed token on login (valid 30 days); every protected API request verifies this token to identify the user

### Frontend
- **HTML5 / CSS3** — same semantic structure and design system as the original, extended with new components (calendar grid, habit list, progress bar, day panel, auth pages)
- **CSS Custom Properties (variables)** — full light/dark theme system with smooth transitions, shared across all pages via one `styles.css`
- **Vanilla JavaScript** — no frontend framework; `app.js` and `calendar.js` communicate with the backend via the `fetch` API
- **auth.js** — shared utility loaded on every page; handles token storage, the `authFetch` wrapper, backend detection, and the `requireAuth` guard
- **CSS Grid** — used for both the stats row and the 7-column calendar grid
- **Flexbox** — task items, forms, nav bar, and day panel layout

### Hosting
- **Render** — hosts the Node.js backend; provides a public HTTPS URL so accounts and data sync across any device on any network
- **GitHub Pages** — hosts the static frontend; automatically detects whether the Render backend is reachable and falls back to localStorage if not

### Authentication Flow
1. User registers with username, email, and password
2. Server hashes the password with `bcryptjs` and stores the hash — the raw password is never saved
3. On login, `bcryptjs.compare` checks the submitted password against the stored hash
4. If valid, the server signs a **JWT token** containing the user's ID and username, valid for 30 days
5. The token is stored in `localStorage` on the client
6. Every API request sends `Authorization: Bearer <token>` in the header
7. The server's `requireAuth` middleware verifies the token on every protected route and extracts the user ID, so each user only ever sees their own data

### API
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/register` | — | Create a new account |
| `POST` | `/api/login` | — | Sign in, receive JWT token |
| `GET` | `/api/me` | ✓ | Verify token, return user info |
| `GET` | `/api/tasks` | ✓ | Get all tasks (optional `?date=` filter) |
| `GET` | `/api/tasks/calendar` | ✓ | Get task counts per day for a month |
| `POST` | `/api/tasks` | ✓ | Create a task |
| `PATCH` | `/api/tasks/:id` | ✓ | Update a task |
| `DELETE` | `/api/tasks/:id` | ✓ | Delete a task |
| `GET` | `/api/habits` | ✓ | Get all habits with streak + today's status |
| `POST` | `/api/habits` | ✓ | Create a habit |
| `DELETE` | `/api/habits/:id` | ✓ | Delete a habit |
| `POST` | `/api/habits/:id/toggle` | ✓ | Toggle today's completion for a habit |
| `GET` | `/api/stats` | ✓ | Overall stats and day streak |

---

## Hosting on Render

Render is the cloud platform hosting the Node.js backend so that user accounts and data sync across any device on any network.

### How it was deployed
1. Created a free account at [render.com](https://render.com) and connected the GitHub repository
2. Created a **Web Service** with the following settings:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
3. Render automatically deploys on every push to `main`

### How it works with GitHub Pages
- When a user visits the **GitHub Pages** site, `auth.js` detects whether the Render backend is reachable
- If Render responds (status 200 or 401), all API calls are routed to `https://productivity-tracker-capstone.onrender.com`
- CORS headers on the server explicitly allow requests from `https://sidh426.github.io`
- If Render is unreachable (cold start, downtime), the site falls back to **localStorage mode** automatically

> **Note:** Render's free tier spins down after 15 minutes of inactivity. The first request after a sleep period may take 30–60 seconds to respond while the server wakes up.

---

## Features

- **User Accounts** — register and log in from any device; all data is private per account
- **Dashboard** — today's tasks, overall stats, day streak, and daily progress bar
- **Calendar** — monthly grid view with colored dots showing task load per day; click any day to view or add tasks for that date
- **Habit Tracker** — separate list of recurring daily habits, each with a per-habit 🔥 streak counter
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

Open `http://localhost:3000` in your browser. The SQLite database file (`tracker.db`) is created automatically on first run. Register an account and your data will persist locally across sessions.

---

## Project Structure

```
Productivity-Tracker-Capstone/
├── server.js          # Express + SQLite + JWT auth + all API routes
├── package.json
├── tracker.db         # SQLite database (auto-created on first run)
└── docs/              # Static files served by Express and GitHub Pages
    ├── index.html     # Dashboard (protected — requires login)
    ├── calendar.html  # Calendar planning (protected)
    ├── login.html     # Login page
    ├── register.html  # Registration page
    ├── about.html     # About page
    ├── styles.css     # Shared design system (light + dark theme)
    ├── auth.js        # Shared auth utilities (token, API base, requireAuth)
    ├── app.js         # Dashboard JavaScript (tasks, habits, stats)
    └── calendar.js    # Calendar JavaScript (grid, day panel, navigation)
```
