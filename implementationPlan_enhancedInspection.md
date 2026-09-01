# Implementation Plan — 4 Jenis Inspeksi & Peningkatan Traceability Pass All di IQC Material

Standarisasi arsitektur **4 Jenis / Tahap Inspeksi** di IQC Material (**Raw Material**, **Rolling Inspection (Raw)**, **Laminating**, dan **Bonding Test**), serta peningkatan akuntabilitas dan *traceability* operasional saat Admin mengeksekusi fitur **Pass All**. Sistem akan mencatat secara *real-time* **PIC Inspector** (berdasarkan penugasan wewenang/kategori material di *Manage Users*) sekaligus **Admin Eksekutor** beserta alasan *Pass All*, sehingga riwayat audit menjadi 100% transparan dan lolos audit QMS/ISO.

---

## User Review Required

> [!IMPORTANT]
> **4 Jenis / Tahap Inspeksi di IQC Material**:
> 1. **Raw Material Inspection**: Pengecekan sampling fisik kedatangan material, Qty Inspect, Qty Fail, Defect Notes, Color Check, Leader Approval, dan Evidence.
> 2. **Rolling Inspection (Raw Stage)**: Pengecekan mandiri untuk gulungan roll material mentah (*raw fabric/textile/synthetic*) sebelum masuk proses lanjutan, mencakup visual roll defect, roll percentage, meter/yard, dan evidence.
> 3. **Laminating Material Inspection**: Pengecekan material setelah proses laminasi (Color Check, Packaging Check, dan **pemeriksaan roll pasca-laminasi tetap dipertahankan di tab ini**).
> 4. **Bonding Test**: Pengujian laboratorium daya rekat (*bonding strength*), upload file laporan pengujian lab, dan catatan uji lab.

> [!IMPORTANT]
> **Dual-Actor Traceability pada Pass All**:
> - `inspector_nik` & `inspector_name`: PIC Inspector yang berwenang atas jenis/kategori material tersebut.
> - `executed_by` / `admin_name`: Nama Admin yang menekan tombol *Pass All*.
> - `pass_reason`: Alasan bypass inspeksi (*CoA Vendor Valid, Direct to Line, Vendor Grade A, Instruksi Leader/Manager, dll.*).
> - `input_type`: `'batch_pass_all'` vs `'manual'`.

---

## Proposed Changes

### 1. Database Layer (Supabase)

#### [MODIFY] [supabase-material-db.sql](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/supabase-material-db.sql)
- **Tabel `public.material_master_data`**:
  - Tambahkan kolom status flag untuk Rolling: `rolling_done BOOLEAN DEFAULT FALSE`.
  - Master data memiliki tracking 4 status independen: `raw_done`, `rolling_done`, `laminating_done`, `bonding_done`.
- **Tabel `public.material_inspections`**:
  - Tambahkan kolom:
    - `executed_by TEXT` (Nama admin yang mengeksekusi Pass All).
    - `pass_reason TEXT` (Catatan / alasan Pass All).
  - Kolom `inspection_type` mendukung 4 nilai standar: `'Raw Material'`, `'Rolling Inspection'`, `'Laminating'`, `'Bonding Test'`.
- **RPC `fn_pass_all_materials(target_ids, admin_nik, admin_name, p_reason)`**:
  - Melakukan pencocokan (*matching*) `material_type` dari PO ke `material_assignment` di `material_users`.
  - Mencatat `inspector_nik`, `executed_by = admin_name`, `pass_reason = p_reason`, dan `input_type = 'batch_pass_all'`.
  - Mengupdate seluruh status flag (`raw_done = TRUE, rolling_done = TRUE, laminating_done = TRUE, bonding_done = TRUE`) dan `status = 'done'`.

---

### 2. Frontend Inspection Form (IQC Material)

#### [MODIFY] [material/index.html](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/material/index.html)
- **Header Navigasi Tab (4 Tabs)**:
  - `tab-check-raw`: **Raw Material**
  - `tab-check-rolling`: **Rolling Inspection** *(Tab Baru untuk Raw Roll)*
  - `tab-check-laminating`: **Laminating** *(Tetap mempertahankan sub-fitur Roll Inspection pasca laminasi)*
  - `tab-check-bonding`: **Bonding Test**
- **Form Body Section**:
  - Tambahkan container `#form-rolling-inspection-body` untuk input Rolling Inspection (Roll Visual Check, Roll Defect Notes, Roll Percentage, Leader Approval, Evidence).
- **PO List Card**:
  - Update render kartu PO di sidebar kiri untuk menampilkan 4 indikator badge status: `[Raw]` `[Roll]` `[Lam]` `[Bond]`.

#### [MODIFY] [js/material/form.js](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/js/material/form.js)
- Update `switchInspectionTab(type)` untuk mendukung 4 tab: `'raw'`, `'rolling'`, `'laminating'`, `'bonding'`.
- Update validasi input form dan submit payload `apiSubmitInspection` untuk menangani tipe `'Rolling Inspection'`.
- Update dialog konfirmasi agar merangkum data dari 4 jenis inspeksi secara akurat.

---

### 3. API & Data Layer

#### [MODIFY] [js/material/api.js](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/js/material/api.js)
- Update `apiSubmitInspection`:
  - Mendeteksi 4 tipe inspeksi (`isRaw`, `isRolling`, `isLam`, `isBonding`).
  - Mengupdate flag status PO di `material_master_data` (`rolling_done = true` saat tipe rolling disubmit).
  - Mengubah status PO menjadi `done` jika semua tahapan yang diperlukan telah selesai.
- Update `apiPassAll(rowIds, adminNik, adminName, reason)`:
  - Mengirim parameter `p_reason` ke RPC `fn_pass_all_materials`.
- Update `apiSaveUser`:
  - Memastikan `material_assignment` (jenis inspeksi & kategori material) tersimpan ke `material_users`.

---

### 4. Tab Manage Users & Pass All (Admin Panel)

#### [MODIFY] [material/admin.html](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/material/admin.html)
- **Tab Manage Users**:
  - Ganti input teks `#user-material-assignment` dengan **Multi-Select Checklist Badge**:
    - **Wewenang Jenis Inspeksi**: `Raw Material`, `Rolling Inspection`, `Laminating`, `Bonding Test`.
    - **Kategori Material**: `TEXTILE`, `SYNTHETIC`, `LEATHER`, `ACCESSORIES & CHEMICAL`, `ALL`.
- **Tab Pass All**:
  - Tambahkan dropdown pilihan **"Alasan Pass All"** (`#passall-reason`):
    - *Sertifikat CoA / Lab Test Vendor Valid*
    - *Direct to Line (Urgent Production)*
    - *Vendor Grade A (Certified)*
    - *Instruksi Leader / Manager*
    - *Lainnya (Custom Note)*
  - Tampilkan badge PIC Inspector yang ditugaskan pada setiap item di list preview Pass All.

#### [MODIFY] [js/material/admin.js](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/js/material/admin.js)
- Update `handleUserSubmit` dan `editUser` untuk menyimpan dan memuat checklist wewenang jenis inspeksi & kategori material.
- Update `confirmPassAll` untuk membaca nilai alasan `#passall-reason` dan meneruskannya ke `apiPassAll`.

---

### 5. Tab Inspection Log & Filter (Admin Panel)

#### [MODIFY] [js/material/inspection-log.js](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-IQC/js/material/inspection-log.js)
- **Filter Jenis Inspeksi**:
  - Dropdown filter mendukung 4 jenis: `Semua Jenis`, `Raw Material`, `Rolling Inspection`, `Laminating`, `Bonding Test`.
- **Tabel & Badge**:
  - Badge warna terstandarisasi:
    - `Raw Material`: Hijau / Emerald
    - `Rolling Inspection`: Cyan / Sky Blue
    - `Laminating`: Amber / Ungu
    - `Bonding Test`: Rose / Pink
  - Pada baris Pass All: Tampilkan sub-label `[Pass All by Admin: {admin_name}]` beserta tooltip alasan Pass All.
- **Modal Detail Inspeksi**:
  - Menampilkan informasi lengkap: PIC Inspector, Admin Eksekutor, Alasan Bypass, dan detail teknis rolling/laminating/bonding.

---

## Verification Plan

### Automated Tests
- Eksekusi scratch Python script untuk memverifikasi RPC `fn_pass_all_materials` dan penyimpanan 4 jenis inspeksi ke Supabase.

### Manual Verification
1. **Form Input (4 Tabs)**:
   - Pilih PO -> Buka Tab *Raw Material* -> Submit -> Pastikan badge `[Raw: ✓]` aktif.
   - Buka Tab *Rolling Inspection* -> Isi data roll raw material -> Submit -> Pastikan badge `[Roll: ✓]` aktif.
   - Buka Tab *Laminating* -> Pastikan sub-fitur Roll Inspection pasca laminasi tetap berfungsi -> Submit.
   - Buka Tab *Bonding Test* -> Upload file hasil uji lab -> Submit -> Pastikan status PO menjadi `Done`.
2. **Manage Users**:
   - Tetapkan wewenang *Rolling Inspection* & *Textile* pada Inspector A.
   - Tetapkan wewenang *Laminating* pada Inspector B.
   - Verifikasi data tersimpan dan tampil dalam bentuk badge.
3. **Pass All**:
   - Buka tab Pass All -> Pilih PO -> Pilih alasan "Sertifikat CoA Valid" -> Jalankan Pass.
   - Buka Inspection Log -> Pastikan tercatat nama PIC Inspector + `[Pass All by Admin]` + alasan bypass.
