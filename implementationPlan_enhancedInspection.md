# Implementation Plan — Peningkatan Traceability Pass All & Penugasan Jenis Material di IQC Material

Meningkatkan akuntabilitas dan *traceability* operasional pada modul **IQC Material** saat Admin mengeksekusi fitur **Pass All**. Sistem akan mencatat secara *real-time* **PIC Inspector** (berdasarkan penugasan kategori material di *Manage Users*) sekaligus **Admin Eksekutor** beserta alasan *Pass All*, sehingga tidak ada penumpukan nama fiktif pada satu inspector dan riwayat audit menjadi 100% transparan.

---

## User Review Required

> [!IMPORTANT]
> **Dual-Actor Traceability**: Setiap transaksi Pass All akan mencatat:
> 1. `inspector_nik` & nama PIC Material Inspector terkait.
> 2. `executed_by` / `admin_name` yang mengeksekusi Pass All.
> 3. `pass_reason` (alasan bypass / pass all).
> 4. `input_type = 'batch_pass_all'`.

> [!NOTE]
> **Daftar Kategori Pengecekan / Material Standar**:
> - `TEXTILE`
> - `SYNTHETIC / PU`
> - `LEATHER`
> - `LAMINATING`
> - `ACCESSORIES & CHEMICAL`
> - `OUTSOLE & RUBBER / EVA`
> - `LAB TEST & PHYSICAL`
> - `ALL (General Inspector)`

---

## Proposed Changes

### 1. Database & Supabase RPC Layer

#### [MODIFY] [supabase-material-db.sql](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/supabase-material-db.sql)
- Tambahkan kolom opsional `executed_by` (TEXT) dan `pass_reason` (TEXT) pada tabel `material_inspections`.
- Perbarui RPC `fn_pass_all_materials(target_ids, admin_nik, admin_name, p_reason)`:
  1. Melakukan pencocokan (*matching*) `material_type` dari PO ke `material_assignment` di `material_users`.
  2. Jika ada lebih dari satu inspector untuk material tersebut, mengambil inspector yang relevan atau menugaskan sesuai mapping.
  3. Mencatat `inspector_nik`, `executed_by` = `admin_name`, `pass_reason` = `p_reason`, dan `input_type` = `'batch_pass_all'`.

---

### 2. UI & Logika Tab Manage Users (IQC Material)

#### [MODIFY] [material/admin.html](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/material/admin.html)
- Pada modal/form Add/Edit User (`#user-form`):
  - Ganti input teks biasa `#user-material-assignment` dengan **Checklist / Multi-Select Badge** kategori material standar (`TEXTILE`, `SYNTHETIC`, `LEATHER`, `LAMINATING`, `ACCESSORIES`, `OUTSOLE`, `LAB TEST`, `ALL`).
- Pada tabel Manage Users (`#users-tbody`):
  - Render badge kategori penugasan material dengan warna terstandarisasi.

#### [MODIFY] [js/material/admin.js](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/js/material/admin.js)
- Perbarui `handleUserSubmit` agar mengumpulkan nilai checkbox kategori yang dipilih dan mengirimkan array/string `material_assignment` ke `apiSaveUser`.
- Perbarui `window.editUser` agar men-centang (*check*) checkbox kategori sesuai data user yang sedang diedit.
- Perbarui `resetUserForm` untuk mereset seluruh checkbox penugasan.

---

### 3. UI & Logika Tab Pass All (IQC Material)

#### [MODIFY] [material/admin.html](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/material/admin.html)
- Tambahkan input/dropdown opsional **"Alasan Pass All"** (`#passall-reason`) sebelum tombol konfirmasi:
  - *Sertifikat CoA / Lab Test Vendor Valid*
  - *Direct to Line (Urgent Production)*
  - *Vendor Grade A (Certified)*
  - *Instruksi Leader / Manager*
  - *Lainnya (Custom Note)*
- Tampilkan indikator badge PIC Inspector penanggung jawab di samping masing-masing PO pada daftar preview Pass All.

#### [MODIFY] [js/material/admin.js](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/js/material/admin.js)
- Perbarui `window.confirmPassAll` untuk membaca nilai alasan `#passall-reason` dan mengirimkannya ke `apiPassAll`.

#### [MODIFY] [js/material/api.js](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/js/material/api.js)
- Perbarui fungsi `apiPassAll(rowIds, adminNik, adminName, reason)` untuk meneruskan parameter `p_reason` ke RPC `fn_pass_all_materials`.
- Pastikan `apiSaveUser` selalu menyertakan `material_assignment` saat create maupun update user.

---

### 4. UI & Tampilan Inspection Log (IQC Material)

#### [MODIFY] [js/material/inspection-log.js](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/js/material/inspection-log.js)
- Pada tabel Inspection Log:
  - Kolom **Inspector**: Menampilkan nama PIC Inspector hasil penugasan kategori material.
  - Untuk baris hasil Pass All: Tampilkan sub-label / badge informatif `[Pass All by Admin: {admin_name}]` dan tooltip alasan Pass All.
- Pada modal detail inspeksi: Tampilkan rincian audit (*PIC Inspector*, *Eksekutor Pass All*, *Waktu Eksekusi*, dan *Alasan Bypass*).

---

## Verification Plan

### Automated Tests
- Eksekusi script scratch Python untuk menguji RPC `fn_pass_all_materials` dengan target ID berbagai jenis material (`TEXTILE`, `LEATHER`, `SYNTHETIC`) dan memverifikasi bahwa `inspector_nik` terpetakan ke PIC yang tepat, bukan selalu orang pertama.

### Manual Verification
1. **Manage Users**:
   - Buka tab *Manage Users* di Admin IQC Material.
   - Edit user: centang *TEXTILE* untuk Inspector A, centang *LEATHER* untuk Inspector B.
   - Simpan dan pastikan badge penugasan tertera dengan benar di tabel.
2. **Pass All**:
   - Buka tab *Pass All*, pilih PO dengan material *TEXTILE* dan *LEATHER*.
   - Pilih alasan *Pass All* -> Klik *Jalankan Pass*.
3. **Inspection Log**:
   - Buka tab *Inspection Log*.
   - Verifikasi bahwa PO *TEXTILE* tercatat atas nama Inspector A, dan PO *LEATHER* tercatat atas nama Inspector B, dengan label *Pass All by Admin*.
