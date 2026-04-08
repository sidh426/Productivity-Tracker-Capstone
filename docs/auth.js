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

// ── Backend detection ──
// Resolves the /api prefix correctly whether running on localhost or a subdirectory.
// Uses the origin so relative fetch always hits the right server.
let _backendAvailable = null;

async function isBackendAvailable() {
    if (_backendAvailable !== null) return _backendAvailable;
    try {
        const res = await fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${getToken() || ''}` },
            signal: AbortSignal.timeout(1500)
        });
        // 200 = logged in, 401 = backend up but no token — both mean backend exists.
        // 404 = GitHub Pages (no backend). Anything else network-level = no backend.
        _backendAvailable = (res.status === 200 || res.status === 401);
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
// Uses RELATIVE paths so it works on localhost, GitHub Pages, and any subdirectory.
async function requireAuth() {
    const backendUp = await isBackendAvailable();
    if (!backendUp) return false; // static/offline mode — skip auth entirely

    const token = getToken();
    if (!token) { window.location.href = 'login.html'; return false; }

    // Verify token is still valid with the server
    const res = await authFetch('/api/me');
    if (!res.ok) {
        clearAuth();
        window.location.href = 'login.html';
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
    window.location.href = 'login.html';
}

// ── Wire up logout button if present ──
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('logout-btn');
    if (btn) btn.addEventListener('click', logout);
});
