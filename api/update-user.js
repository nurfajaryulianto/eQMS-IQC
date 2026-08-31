// api/update-user.js — Vercel Serverless Function
// Memperbarui display_name, role (dan opsional password) di auth + app_users.
// Memerlukan env var: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (req.method !== 'PATCH') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const token = req.headers['authorization']?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized: token tidak ditemukan.' });

    const supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !caller) return res.status(401).json({ error: 'Sesi tidak valid. Silakan login ulang.' });
    if (caller.user_metadata?.role !== 'admin') {
        return res.status(403).json({ error: 'Hanya admin yang dapat mengubah user.' });
    }

    const { app_user_id, display_name, role, password } = req.body ?? {};
    if (!app_user_id || !display_name || !role) {
        return res.status(400).json({ error: 'app_user_id, Display Name, dan Role wajib diisi.' });
    }
    if (!['inspector', 'auditor', 'supervisor', 'manager', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Role tidak valid.' });
    }
    if (password && password.length < 6) {
        return res.status(400).json({ error: 'Password minimal 6 karakter.' });
    }

    // ── Ambil data user dari app_users ────────────────────────
    const { data: appUser, error: lookupErr } = await supabaseAdmin
        .from('app_users')
        .select('auth_user_id, nik')
        .eq('id', app_user_id)
        .single();
    if (lookupErr || !appUser) return res.status(404).json({ error: 'User tidak ditemukan.' });

    let authUserId = appUser.auth_user_id;

    // Fallback: cari auth user berdasarkan email jika auth_user_id belum tersimpan
    if (!authUserId) {
        const email = `${appUser.nik.toLowerCase()}@eqms.internal`;
        const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        if (!listErr && users) {
            const found = users.find(u => u.email === email);
            if (found) authUserId = found.id;
        }
    }

    // ── Perbarui Supabase Auth user ───────────────────────────
    if (authUserId) {
        const updatePayload = {
            user_metadata: { display_name, nik: appUser.nik, role },
        };
        if (password) updatePayload.password = password;

        const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, updatePayload);
        if (updateErr) return res.status(400).json({ error: updateErr.message });

        // Simpan auth_user_id jika belum ada
        if (!appUser.auth_user_id) {
            await supabaseAdmin.from('app_users').update({ auth_user_id: authUserId }).eq('id', app_user_id);
        }
    }

    // ── Perbarui app_users ─────────────────────────────────────
    const { error: dbErr } = await supabaseAdmin
        .from('app_users')
        .update({ display_name, role })
        .eq('id', app_user_id);
    if (dbErr) return res.status(400).json({ error: dbErr.message });

    return res.status(200).json({ success: true, message: `User "${display_name}" berhasil diperbarui.` });
};
