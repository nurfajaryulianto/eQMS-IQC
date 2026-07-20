// api/create-user.js — Vercel Serverless Function
// Membuat akun Supabase Auth + row app_users secara atomik.
// Memerlukan env var: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    // CORS preflight
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Ambil dan validasi JWT pemanggil ──────────────────────
    const token = req.headers['authorization']?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized: token tidak ditemukan.' });

    const supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verifikasi JWT dan cek role admin
    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !caller) return res.status(401).json({ error: 'Sesi tidak valid. Silakan login ulang.' });
    if (caller.user_metadata?.role !== 'admin') {
        return res.status(403).json({ error: 'Hanya admin yang dapat membuat user baru.' });
    }

    // ── Validasi payload ──────────────────────────────────────
    const { nik, display_name, role, password } = req.body ?? {};

    if (!nik || !display_name || !role || !password) {
        return res.status(400).json({ error: 'NIK, Display Name, Role, dan Password wajib diisi.' });
    }
    if (!/^[a-zA-Z0-9]{1,20}$/.test(nik)) {
        return res.status(400).json({ error: 'NIK hanya boleh alfanumerik, maks 20 karakter.' });
    }
    if (!['auditor', 'supervisor', 'manager', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Role tidak valid.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password minimal 6 karakter.' });
    }

    const email = `${nik.toLowerCase()}@eqms.internal`;

    // ── Buat akun Supabase Auth ───────────────────────────────
    const { data: { user: newUser }, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name, nik, role },
    });
    if (createErr) return res.status(400).json({ error: createErr.message });

    // ── Insert ke app_users (serta simpan auth_user_id) ───────
    const { error: dbErr } = await supabaseAdmin
        .from('app_users')
        .insert({ nik, display_name, role, auth_user_id: newUser.id });

    if (dbErr) {
        // Rollback: hapus auth user yang baru dibuat
        await supabaseAdmin.auth.admin.deleteUser(newUser.id);
        return res.status(400).json({ error: `Gagal menyimpan ke database: ${dbErr.message}` });
    }

    return res.status(200).json({ success: true, message: `User "${display_name}" berhasil dibuat.` });
};
