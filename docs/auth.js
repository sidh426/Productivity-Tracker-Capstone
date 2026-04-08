// ── auth.js — shared auth utilities ──
// Included on every page. Handles token storage, API calls with auth
// headers, and redirecting unauthenticated users to login.

const AUTH_TOKEN_KEY = 'pt_auth_token';
const AUTH_USER_KEY  = 'pt_auth_user';

// ── Token helpers ──
function getToken()            { return localStorage.getItem(AUTH_TOKEN_KEY); }
function getUser()             { try { return JSON.parse(localStorage.getItem(AUTH_USER_KEY)); } catch(e) { return null; } }
function saveAuth(token, user) { localStorage.setItem(AUTH_TOKEN_KEY, token); localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user)); }
function clearAuth()           { localStorage.removeItem(AUTH_TOKEN_KEY); localStorage.removeItem(AUTH_USER_KEY); }

// ── Base path — works for both localhost and GitHub Pages subdirectories ──
// e.g. localhost → '', GitHub Pages → '/Productivity-Tracker-Capstone'
const BASE = (() => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    // On GitHub Pages the repo name is the first path segment
    // On localhost there's no meaningful prefix
    if (window.location.hostname.endsWith('github.io') && parts.length > 0) {
        return '/' + parts[0];
    }
    return '';
})();

function toPath(page) { return BASE + '/' + page; }

// ── Backend detection ──
let _backendAvailable = null;

async function isBackendAvailable() {
    if (_backendAvailable !== null) return _backendAvailable;
    try {
        const res = await fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${getToken() || ''}` },
            signal: AbortSignal.timeout(1500)
        });
        // Backend is up only if it returns 200 or 401.
        // GitHub Pages returns 404 for /api/* — that means no backend.
        _backendAvailable = res.status === 200 || res.status === 401;
    } catch(e) {
        _backendAvailable = false;
    }
    return _backendAvailable;
}

// ── Auth fetch — wraps fetch with Authorization header ──
async function authFetch(url, options = {}) {
    const token = getToken();
    return fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
    });
}

// ── Guard — call on protected pages ──
// If backend is up and user isn't logged in, redirect to login.
// If backend is down, allow localStorage mode (no redirect).
async function requireAuth() {
    const backendUp = await isBackendAvailable();
    if (!backendUp) return false; // offline/static mode — skip auth

    const token = getToken();
    if (!token) { window.location.href = toPath('login.html'); return false; }

    // Verify token is still valid
    const res = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
        clearAuth();
        window.location.href = toPath('login.html');
        return false;
    }

    const user = await res.json();
    saveAuth(token, user);

    // Show username in nav if element exists
    const el = document.getElementById('nav-username');
    if (el) el.textContent = user.username;

    return true;
}

// ── Logout ──
function logout() {
    clearAuth();
    window.location.href = toPath('login.html');
}

// ── Wire up logout button if present ──
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('logout-btn');
    if (btn) btn.addEventListener('click', logout);
});
