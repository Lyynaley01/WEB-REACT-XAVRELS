# WA Reaction — Vercel Edition

Versi ini memindahkan frontend PHP ke HTML/CSS/JavaScript dan memindahkan backend PHP ke Vercel Node.js Serverless Functions. Data redeem/settings/limit tidak lagi ditulis ke file JSON lokal karena filesystem serverless tidak cocok untuk storage persisten; project memakai PostgreSQL melalui Neon.

## Fitur yang dipertahankan
- UI utama, modal admin, redeem, tutorial, alert/toast, dan dashboard.
- Reaction satu atau sampai 5 emoji.
- Admin login/logout.
- Generate, toggle, delete redeem code.
- Global settings: jumlah generate, bonus limit, dan maksimum pengguna per kode.
- Redeem berdasarkan identitas IP yang di-hash.
- Limit harian server-side, bukan hanya localStorage.
- API key reaction tetap di server dan tidak dikirim ke browser.
- Rate limit login.
- Signed HttpOnly admin session cookie + CSRF token + same-origin check.
- Header keamanan dasar.
- PostgreSQL persisten dan aman untuk deployment serverless.

## Deploy
1. Buat project di Vercel dan hubungkan repository/project ini.
2. Tambahkan database PostgreSQL/Neon dan isi `DATABASE_URL`.
3. Tambahkan environment variables dari `.env.example`: `ADMIN_PASSWORD`, `SESSION_SECRET`, `IP_HASH_SALT`, `REACTION_API_KEY`.
4. Jalankan `npm install`.
5. Untuk setup database lokal/CI, jalankan `npm run db:init` setelah `DATABASE_URL` tersedia.
6. Deploy ke Vercel. Vercel akan mendeteksi folder `/api` sebagai Serverless Functions.

Jangan memasukkan `.env` ke GitHub.

## Catatan migrasi data lama
File `redeem_codes.json` dan `system_settings.json` dari hosting PHP lama tidak otomatis ikut karena file tersebut tidak ada di source yang diberikan. Jika data lama masih diperlukan, import data lama ke tabel PostgreSQL sebelum memakai redeem production.

## Local development
`npm run dev`

Frontend:
- `/`
- `/admin.html`
- `/redeem.html`

API:
- `/api/auth`
- `/api/react`
- `/api/redeem`
- `/api/settings`
- `/api/usage`
