# Implementation Plan — Multi-Inspector Material-Based Assignment (Solusi 1)

Rencana implementasi penugasan dan penyaringan material spesifik (**Material Code / Material Name**) untuk kelompok inspector (misal: tim Leather A vs tim Leather B).

## User Review Required

> [!NOTE]
> Fitur ini didokumentasikan sebagai acuan pengembangan di masa mendatang sesuai instruksi user (di-skip untuk saat ini).

---

## Overview & Architecture

Fitur ini memungkinkan Admin untuk menugaskan **lebih dari satu inspector** pada **kode/nama material spesifik** (bukan hanya kategori umum), serta memfilter tampilan daftar PO pada layar inspector sesuai dengan material yang ditugaskan kepada pengguna yang sedang login.

### 1. Admin Panel — Manage Users (`material/admin.html` & `js/material/admin.js`)
- Field **Material Assignment** pada form Tambah/Edit User dapat menerima multiple nilai terpisah koma (contoh: `RM.SYN.008020007L.10A, Leather-Synthetic, RM.TXT.03N500`).
- Mendukung pemisahan koma/tag sehingga beberapa inspector (misal: Fajar & Ahmad) dapat memiliki assignment kode material yang persis sama.

### 2. Frontend Inspection Form (`js/material/form.js`)
- Saat pengguna login (misal `currentUser.material_assignment` berisi daftar kode material), daftar PO di halaman `material/index.html` difilter berdasarkan pencocokan `po.material_name` atau `po.material_type` terhadap `material_assignment` milik pengguna tersebut.
- Jika ada 2 inspector (misal Fajar & Ahmad) dengan assignment kode material yang sama, keduanya akan melihat daftar PO material yang sama.

### 3. Backend Google Apps Script (`gas/CodeMaterial.gs`)
- **`passAll()`**: Saat admin memicu Pass All, sistem mencari semua inspector yang ditugaskan ke kode material / tipe material tersebut dari sheet `users` & `material_assignments`, lalu menggabungkan nama-nama inspector tersebut (misal: `"Fajar & Ahmad"`) ke kolom `inspector_nik` / `inspector_name` pada sheet `inspections`.
- **`submitInspection()`**: Ketika terjadi akumulasi inspeksi bertahap (*in-progress* hingga *done*) dari lebih dari 1 inspector, backend menggabungkan NIK/Nama dari semua inspector yang terlibat (misal: `"Fajar Yulianto & Ahmad"`).

---

## Proposed Changes

### Backend Components

#### [MODIFY] [CodeMaterial.gs](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-main/eQMS-IQC/gas/CodeMaterial.gs)
- Update matching logic pada `passAll()` agar pencocokan assignment dilakukan terhadap `material_name` (kode material) selain `material_type`.
- Update penggabungan nama inspector pada akumulasi baris inspeksi di `submitInspection()`.

### Frontend Components

#### [MODIFY] [admin.html](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-main/eQMS-IQC/material/admin.html)
- Berikan hint / contoh pengisian koma untuk multiple kode material pada input `user-material-assignment`.

#### [MODIFY] [admin.js](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-main/eQMS-IQC/js/material/admin.js)
- Pastikan pembacaan dan penyimpan data `material_assignment` memproses array/string terpisah koma.

#### [MODIFY] [form.js](file:///c:/Users/fajar.yulianto/Documents/ISENG/eQMS-main/eQMS-IQC/js/material/form.js)
- Update `filterPOList()` agar mencocokkan `po.material_name` dan `po.material_type` dengan list `currentUser.material_assignment`.

---

## Verification Plan

### Automated / Manual Verification
- Testing penetapan multiple kode material pada 2 user (misal Fajar & Ahmad).
- Verifikasi halaman inspection form Fajar hanya menampilkan PO dengan kode material yang di-assign.
- Verifikasi akumulasi data pada sheet `inspections` mencatat kedua nama inspector secara akurat.
