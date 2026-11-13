# Photobooth Backend API (Node.js + Express.js + Supabase)

Implementasi **Backend REST API & Database** untuk **Aplikasi Photobooth (PWA)** sesuai spesifikasi **BRD v1.0** dan **PRD v1.0** (Pemilik Proyek: M. Agil Ripai - NIM 241111081).

> **Catatan Simulasi (BE-14 & SEC-06):** Seluruh fitur langganan Premium (Rp19.000/bulan & Rp149.000/tahun) serta metode pembayaran (`qris`, `ewallet`, `card`) di proyek ini adalah **SIMULASI / DUMMY** untuk keperluan tugas kuliah. Tidak ada payment gateway asli dan sistem menolak penyimpanan nomor kartu/rekening asli.

---

## 1. Struktur Proyek

```text
photobot/
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql   # Migrasi 10 tabel PostgreSQL, indeks, bucket Storage, dan RLS
│   └── seed.sql                     # Seed resmi: 2 paket simulasi, 4 layout, 6 frame, 7 filter, 9 stiker/overlay
├── src/
│   ├── config/
│   │   ├── env.js                   # Konfigurasi environment variables server
│   │   ├── seed-data.js             # Data katalog & paket simulasi sesuai Bab 6 BRD & PRD
│   │   └── supabase.js              # Koneksi @supabase/supabase-js (server-side) + fallback store
│   ├── middlewares/
│   │   ├── auth.middleware.js       # Autentikasi JWT stateless & penurunan tier (BE-11)
│   │   └── error.middleware.js      # Format respons error seragam
│   ├── modules/
│   │   ├── auth/                    # POST /register, POST /login, GET /me
│   │   ├── users/                   # GET /me, PATCH /me
│   │   ├── catalog/                 # GET /, GET /templates, GET /filters, GET /stickers
│   │   ├── sessions/                # POST /, GET /, GET /:id, PATCH /:id, POST /:id/upload-url, POST /:id/strip
│   │   ├── subscriptions/           # GET /plans, POST /checkout, GET /me, POST /cancel
│   │   └── downloads/               # POST /, GET /
│   ├── utils/
│   │   └── response.js              # Helper { data } & { error: { code, message } }
│   ├── app.js                       # Konfigurasi Express.js (/api dan /api/v1)
│   └── server.js                    # Entry point HTTP server
├── scripts/
│   └── check-supabase.js            # Skrip uji koneksi Supabase (Lampiran A langkah 5)
├── tests/
│   └── api.test.js                  # Pengujian otomatis seluruh endpoint & aturan bisnis
├── .env.example
└── package.json
```

---

## 2. Persiapan & Menjalankan Server

1. **Instal dependensi:**
   ```bash
   npm install
   ```

2. **Konfigurasi Environment Variables (`.env`):**
   Salin `.env.example` menjadi `.env`, lalu isi kredensial proyek Supabase dari *secure vault*:
   ```bash
   cp .env.example .env
   ```
   > **Mode Fallback Otomatis:** Jika `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` belum diisi di `.env`, backend otomatis berjalan dengan *In-Memory Simulation Store* yang sudah terisi data seed Bab 6 sehingga endpoint dapat langsung diuji oleh tim frontend.

3. **Menjalankan Migrasi & Seed di Supabase (Lampiran A BRD):**
   - Buka **SQL Editor** di dashboard Supabase.
   - Jalankan isi file [`supabase/migrations/001_initial_schema.sql`](./supabase/migrations/001_initial_schema.sql).
   - Jalankan isi file [`supabase/seed.sql`](./supabase/seed.sql).
   - Uji koneksi dari backend:
     ```bash
     npm run db:check
     ```

4. **Menjalankan Server:**
   ```bash
   npm run dev
   # atau produksi:
   npm start
   ```

5. **Menjalankan Pengujian Otomatis:**
   ```bash
   npm test
   ```

---

## 3. Daftar Endpoint REST API (`/api` & `/api/v1`)

Semua respons mengikuti format seragam:
- **Sukses:** `{ "data": { ... } }`
- **Gagal:** `{ "error": { "code": "...", "message": "..." } }`

| Modul | Method & Endpoint | Auth | Deskripsi |
| :--- | :--- | :--- | :--- |
| **Health** | `GET /api/health` | Tidak | Status server & mode koneksi database |
| **Auth** | `POST /api/auth/register` | Tidak | Daftar akun baru (`bcrypt` hash) + terbitkan JWT |
| | `POST /api/auth/login` | Tidak | Login pengguna + kembalikan JWT & tier aktif |
| | `GET /api/auth/me` | Bearer JWT | Profil pengguna saat ini + `tier` resmi dari `subscriptions` |
| **Users** | `GET /api/users/me` | Bearer JWT | Lihat profil pengguna sendiri |
| | `PATCH /api/users/me` | Bearer JWT | Ubah `display_name` atau `avatar_path` (menolak perubahan `tier` langsung) |
| **Katalog** | `GET /api/catalog` | Opsional | Semua katalog aktif (`templates`, `layouts`, `frames`, `filters`, `stickers`) |
| | `GET /api/catalog/templates` | Opsional | Daftar layout & frame (`?kind=layout` / `?kind=frame`) |
| | `GET /api/catalog/filters` | Opsional | Daftar 7 filter warna beserta `css_filter` dan `params` |
| | `GET /api/catalog/stickers` | Opsional | Daftar stiker & overlay beserta `source_name` dan `license` |
| **Sesi Foto** | `POST /api/sessions` | Opsional* | Mulai sesi foto baru; validasi gating Premium (`403` jika Free memilih item Premium) |
| | `GET /api/sessions` | Bearer JWT | Riwayat sesi milik pengguna yang login |
| | `GET /api/sessions/:id` | Opsional* | Detail sesi + daftar `photos` + `signed_strip_url` berumur pendek |
| | `PATCH /api/sessions/:id` | Opsional* | Catat slot foto / retake (`retake_position` menimpa slot yang sama), path strip, status selesai |
| | `POST /api/sessions/:id/upload-url` | Opsional* | Terbitkan *signed upload URL* ke bucket privat `photo-strips/{user_id}/{session_id}.png` |
| | `POST /api/sessions/:id/strip` | Opsional* | Unggah base64 PNG/JPG strip ke `photo-strips` & tandai sesi `completed` |
| **Langganan** | `GET /api/plans` | Tidak | Daftar paket simulasi Bulanan (`Rp19.000`) & Tahunan (`Rp149.000`) + `is_simulation: true` |
| | `POST /api/subscriptions/checkout` | Bearer JWT | Checkout dummy (`qris` / `ewallet` / `card`), aktifkan `subscriptions` + `payments_simulation` |
| | `GET /api/subscriptions/me` | Bearer JWT | Status langganan aktif, tanggal berakhir, dan riwayat simulasi |
| | `POST /api/subscriptions/cancel` | Bearer JWT | Berhenti langganan / reset demo ke tier `free` tanpa menghapus riwayat |
| **Unduhan** | `POST /api/downloads` | Opsional* | Catat unduhan (`png`/`jpg`, `standard`/`hd`); tolak `403` bila Free meminta `hd` |
| | `GET /api/downloads` | Bearer JWT | Riwayat unduhan milik pengguna yang login |
