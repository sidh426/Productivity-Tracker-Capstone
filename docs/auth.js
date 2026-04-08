// ── auth.js — shared auth utilities ──
// Handles token storage, API calls with auth headers, backend detection,
// and redirecting unauthenticated users to the login page.

const AUTH_TOKEN_KEY = 'pt_auth_token';
const AUTH_USER_KEY  = 'pt_auth_user';

// ── API base URL ──
// On Render (same origin) API calls use a relative path: /api/...
// On GitHub Pages the backend lives on Render, so we use the full URL.
const API_BASE = window.location.hostname === 'sidh426.github.io'
    ? 'https://productivity-tracker-capstone.onrender.com'
    : '';

// ── Token helpers ──
function getToken()            { return localStorage.getItem(AUTH_TOKEN_KEY); }
function getUser()             { try { return JSON.parse(localStorage.getItem(AUTH_USER_KEY)); } catch(e) { return null; } }
function saveAuth(token, user) { localStorage.setItem(AUTH_TOKEN_KEY, token); localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user)); }
function clearAuth()           { localStorage.removeItem(AUTH_TOKEN_KEY); localStorage.removeItem(AUTH_USER_KEY); }

// ── Backend detection ──
// Returns true if the Render backend is reachable (200 or 401).
// 404 from GitHub Pages static host = no backend.
let _backendAvailable = null;

async function isBackendAvailable() {
    if (_backendAvailable !== null) return _backendAvailable;
    try {
        const res = await fetch(`${API_BASE}/api/me`, {
            headers: { 'Authorization': `Bearer ${getToken() || ''}` },
            signal: AbortSignal.timeout(3000)
        });
        _backendAvailable = (res.status === 200 || res.status === 401);
    } catch(e) {
        _backendAvailable = false;
    }
    return _backendAvailable;
}

// ── Auth fetch — wraps fetch with Authorization header and correct base URL ──
async function authFetch(path, options = {}) {
    const token = getToken();
    return fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            ...(options.headers || {}),
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
    });
}

// ── Guard — call at the top of every protected page ──
// If backend is up and no valid token → redirect to login.
// If backend is unreachable → localStorage mode, no redirect.
async function requireAuth() {
    const backendUp = await isBackendAvailable();
    if (!backendUp) {
        document.body.style.opacity = '1'; // reveal page in static mode
        return false;
    }

    const token = getToken();
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }

    const res = await authFetch('/api/me');
    if (!res.ok) {
        clearAuth();
        window.location.href = 'login.html';
        return false;
    }

    const user = await res.json();
    saveAuth(token, user);

    // Show username and sign-out button in nav
    const nameEl = document.getElementById('nav-username');
    if (nameEl) nameEl.textContent = user.username;

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';

    document.body.style.opacity = '1'; // reveal page
    return true;
}

// ── Logout ──
function logout() {
    clearAuth();
    window.location.href = 'login.html';
}

// ── Wire up logout button if present ──
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('logout-btn');
    if (btn) btn.addEventListener('click', logout);
});
