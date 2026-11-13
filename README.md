# Aplikasi Photobooth (PWA + Express REST API + Supabase)

Aplikasi Photobooth berbasis web (**Korean Pastel Edition**) dengan dukungan **Progressive Web App (PWA)**, **Backend REST API (Node.js + Express.js)**, serta integrasi **Database PostgreSQL & Object Storage Supabase**.

---

## Struktur Proyek

```text
photobot/
├── frontend/
│   ├── aplikasi-photobooth.html   # Aplikasi utama (Landing, Template, Kamera, Hasil, Langganan, Akun)
│   ├── manifest.webmanifest       # Web App Manifest (PWA)
│   └── sw.js                      # Service Worker untuk caching shell aplikasi
├── backend/
│   ├── src/
│   │   ├── config/                # Konfigurasi environment, Supabase client, & seed data
│   │   ├── middlewares/           # JWT auth middleware & error handler standar JSON
│   │   ├── modules/               # 6 modul utama: auth, users, catalog, sessions, subscriptions, downloads
│   │   ├── utils/                 # Helper response API & AppError
│   │   ├── app.js                 # Express app & static/SPA router
│   │   └── server.js              # Entry point HTTP server
│   ├── supabase/
│   │   ├── migrations/001_initial_schema.sql
│   │   └── seed.sql
│   ├── scripts/check-supabase.js  # Skrip verifikasi koneksi & E2E Supabase
│   ├── tests/api.test.js          # Integration test suite (Node test runner)
│   └── .env.example               # Template variabel environment
└── package.json                   # Root runner scripts
```

---

## Cara Menjalankan Proyek

1. **Instal dependensi backend**:
   ```bash
   cd backend
   npm install
   ```

2. **Konfigurasi Environment**:
   Salin `backend/.env.example` menjadi `backend/.env`, lalu isi kredensial Supabase:
   ```env
   PORT=4000
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   JWT_SECRET=<jwt-secret>
   ```

3. **Jalankan Server (Frontend + Backend)**:
   ```bash
   npm run dev
   ```
   Buka di browser: **`http://localhost:4000`**

4. **Verifikasi Database & Pengujian**:
   ```bash
   npm run db:check
   npm test
   ```
