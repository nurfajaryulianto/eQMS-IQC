// ============================================================
// js/material/auth.js — IQC Material: Standalone Auth Module
// Auth sepenuhnya terpisah dari IQC Subcont (tidak pakai Supabase).
// Session disimpan di localStorage, diverifikasi via GAS backend.
// ============================================================

// ─── CONFIG ──────────────────────────────────────────────────
// Sama dengan URL GAS Material — akan di-overrride oleh import di setiap module
// tapi kita export agar mudah di-update dari satu tempat
export const MATERIAL_GAS_URL = 'https://script.google.com/macros/s/AKfycbz8pi3DM_Rqu-3RVkmArhbAGjBRk3li6D6sM3v609_NTZO1SuJ4MIfTCcbGKfT8snAehw/exec';

const SESSION_KEY = 'iqc_material_session_v1';
const LOGIN_PAGE  = '/material/login.html';

// ─── ROLES ───────────────────────────────────────────────────
export const MATERIAL_ROLES = {
    ADMIN:      'admin',
    SUPERVISOR: 'supervisor',
    MANAGER:    'manager',
    INSPECTOR:  'inspector',
};

// ─── UI TEST MODE ────────────────────────────────────────────
// Set ke true untuk bypass GAS auth (development mode)
export const MATERIAL_TEST_MODE = false;

// Mock session untuk test mode
const MOCK_SESSION = {
    nik:      'admin',
    name:     'Administrator (Mock)',
    role:     MATERIAL_ROLES.ADMIN,
    token:    'mock_token_12345',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

// ─── INACTIVITY AUTO-LOGOUT MANAGER (2 Jam Idle Timeout) ─────
const MATERIAL_INACTIVITY_LIMIT_MS = 2 * 60 * 60 * 1000; // 2 Jam
let materialLastActivityTime = Date.now();
let materialInactivityInterval = null;

export function initMaterialInactivityTimeout(maxIdleMs = MATERIAL_INACTIVITY_LIMIT_MS) {
    materialLastActivityTime = Date.now();

    const resetTimer = () => {
        materialLastActivityTime = Date.now();
    };

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(evt => {
        window.removeEventListener(evt, resetTimer);
        window.addEventListener(evt, resetTimer, { passive: true });
    });

    if (materialInactivityInterval) clearInterval(materialInactivityInterval);
    materialInactivityInterval = setInterval(async () => {
        const idleTime = Date.now() - materialLastActivityTime;
        if (idleTime >= maxIdleMs) {
            clearInterval(materialInactivityInterval);
            alert('Sesi IQC Material Anda telah berakhir karena tidak ada aktivitas selama 2 jam. Silakan login kembali.');
            await materialLogout();
        }
    }, 60 * 1000); // Cek setiap 1 menit
}

// ─── SESSION MANAGEMENT (sessionStorage) ─────────────────────

export function getSession() {
    if (MATERIAL_TEST_MODE) return MOCK_SESSION;
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        // Check expiry
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
            clearSession();
            return null;
        }
        return session;
    } catch {
        return null;
    }
}

export function setSession(sessionData) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
}

export function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
}

export function isLoggedIn() {
    return getSession() !== null;
}

// ─── GET CURRENT USER ─────────────────────────────────────────

export function getMaterialUser() {
    return getSession();
}

// ─── REQUIRE ROLE ────────────────────────────────────────────
// Gunakan di setiap halaman Material untuk memproteksi akses.
// Mengembalikan session user jika authorized, null + redirect jika tidak.

export async function requireMaterialRole(allowedRoles = []) {
    const session = getSession();
    if (!session) {
        window.location.replace(LOGIN_PAGE);
        return null;
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(session.role)) {
        window.location.replace('/unauthorized.html');
        return null;
    }
    initMaterialInactivityTimeout();
    return session;
}

// ─── LOGIN ───────────────────────────────────────────────────

export async function materialLogin(nik, password) {
    if (MATERIAL_TEST_MODE) {
        // In test mode, accept any credentials
        const mockUsers = {
            'admin':     { name: 'Administrator', role: MATERIAL_ROLES.ADMIN },
            'inspector': { name: 'Inspector Test', role: MATERIAL_ROLES.INSPECTOR },
            'spv':       { name: 'Supervisor Test', role: MATERIAL_ROLES.SUPERVISOR },
            'mgr':       { name: 'Manager Test', role: MATERIAL_ROLES.MANAGER },
        };
        const user = mockUsers[nik.toLowerCase()] || { name: nik, role: MATERIAL_ROLES.INSPECTOR };
        const session = {
            nik:       nik,
            name:      user.name,
            role:      user.role,
            token:     'mock_' + Date.now(),
            expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        };
        setSession(session);
        return { success: true, session };
    }

    const res  = await fetch(MATERIAL_GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'login', nik: nik.trim(), password }),
    });
    const json = await res.json();
    if (json.error) return { success: false, message: json.error };

    const session = {
        nik:       json.nik,
        name:      json.name,
        role:      json.role,
        token:     json.token,
        expires_at: json.expires_at,
    };
    setSession(session);
    return { success: true, session };
}

// ─── LOGOUT ──────────────────────────────────────────────────

export async function materialLogout() {
    clearSession();
    window.location.replace(LOGIN_PAGE);
}

// ─── REDIRECT IF LOGGED IN ───────────────────────────────────
// Gunakan di login page agar user yang sudah login langsung di-redirect

export function redirectIfLoggedIn() {
    if (isLoggedIn()) {
        const session = getSession();
        if (session.role === MATERIAL_ROLES.ADMIN || session.role === MATERIAL_ROLES.SUPERVISOR || session.role === MATERIAL_ROLES.MANAGER) {
            window.location.replace('/material/dashboard.html');
        } else {
            window.location.replace('/material/index.html');
        }
    }
}
