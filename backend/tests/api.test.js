process.env.USE_MEMORY_DB = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');
const db = require('../src/config/supabase');

let server;
let baseUrl;

test.before(async () => {
  db.resetMemoryStore();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function apiRequest(path, { method = 'GET', token = null, body = undefined } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  return { status: response.status, json };
}

test('1. Katalog awal sesuai Bab 6 BRD (4 layout, 6 frame, 7 filter, stiker berlisensi)', async () => {
  const { status, json } = await apiRequest('/api/catalog');
  assert.equal(status, 200);
  assert.ok(json.data);
  assert.equal(json.data.layouts.length, 4);
  assert.ok(json.data.frames.length >= 6);
  assert.equal(json.data.filters.length, 7);
  assert.ok(json.data.stickers.length >= 6);

  // Pastikan setiap stiker memiliki source_name dan license (PRD Bab 6 & BRD 5.3)
  for (const sticker of json.data.stickers) {
    assert.ok(sticker.source_name && sticker.source_name.length > 0);
    assert.ok(sticker.license && sticker.license.length > 0);
  }
});

test('2. Auth register, login, /api/auth/me, dan /api/users/me (SEC-01, SEC-02, BE-11)', async () => {
  // Register pengguna pertama
  const regRes = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      email: 'agil@photobooth.edu',
      password: 'PasswordKuat123!',
      display_name: 'M. Agil Ripai',
    },
  });
  assert.equal(regRes.status, 201);
  assert.ok(regRes.json.data.token);
  assert.equal(regRes.json.data.user.email, 'agil@photobooth.edu');
  assert.equal(regRes.json.data.user.tier, 'free');
  assert.equal(regRes.json.data.user.password_hash, undefined);

  const token = regRes.json.data.token;

  // Duplikat email ditolak 409
  const dupRes = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      email: 'agil@photobooth.edu',
      password: 'PasswordKuat123!',
    },
  });
  assert.equal(dupRes.status, 409);

  // Login kembali
  const loginRes = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'agil@photobooth.edu',
      password: 'PasswordKuat123!',
    },
  });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.json.data.user.tier, 'free');

  // Cek /api/auth/me
  const meRes = await apiRequest('/api/auth/me', { token });
  assert.equal(meRes.status, 200);
  assert.equal(meRes.json.data.tier, 'free');

  // BE-11: Manipulasi kolom tier lewat PATCH /api/users/me ditolak 403
  const hackTierRes = await apiRequest('/api/users/me', {
    method: 'PATCH',
    token,
    body: { tier: 'premium' },
  });
  assert.equal(hackTierRes.status, 403);

  // Update display_name sah berhasil
  const patchUserRes = await apiRequest('/api/users/me', {
    method: 'PATCH',
    token,
    body: { display_name: 'M. Agil Ripai (NIM 241111081)' },
  });
  assert.equal(patchUserRes.status, 200);
  assert.equal(
    patchUserRes.json.data.user.display_name,
    'M. Agil Ripai (NIM 241111081)'
  );
});

test('3. Gating Premium di server (BE-10): Pengguna Free ditolak 403 untuk template/filter Premium & unduhan HD', async () => {
  const loginRes = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'agil@photobooth.edu',
      password: 'PasswordKuat123!',
    },
  });
  const token = loginRes.json.data.token;

  // Pengguna Free memaksa layout Premium (grid_2x2) -> 403
  const premiumLayoutRes = await apiRequest('/api/sessions', {
    method: 'POST',
    token,
    body: {
      template_id: 'grid_2x2',
      filter_id: 'normal',
    },
  });
  assert.equal(premiumLayoutRes.status, 403);
  assert.equal(premiumLayoutRes.json.error.code, 'PREMIUM_REQUIRED');

  // Pengguna Free memaksa filter Premium (vintage) -> 403
  const premiumFilterRes = await apiRequest('/api/sessions', {
    method: 'POST',
    token,
    body: {
      template_id: 'strip_4',
      filter_id: 'vintage',
    },
  });
  assert.equal(premiumFilterRes.status, 403);

  // Pengguna Free membuat sesi Free (strip_4 + Pink Susu + Warm) -> 201
  const freeSessionRes = await apiRequest('/api/sessions', {
    method: 'POST',
    token,
    body: {
      template_id: 'strip_4',
      frame_id: 'frame_pink_susu',
      filter_id: 'warm',
    },
  });
  assert.equal(freeSessionRes.status, 201);
  const sessionId = freeSessionRes.json.data.session_id;

  // Catat 4 foto & lakukan retake pada foto ke-2 (FR-08 & BRD 5.3: menimpa baris posisi yang sama)
  await apiRequest(`/api/sessions/${sessionId}`, {
    method: 'PATCH',
    token,
    body: {
      photos: [
        { position: 1 },
        { position: 2 },
        { position: 3 },
        { position: 4 },
      ],
    },
  });

  const retakeRes = await apiRequest(`/api/sessions/${sessionId}`, {
    method: 'PATCH',
    token,
    body: {
      retake_position: 2,
      status: 'completed',
    },
  });
  assert.equal(retakeRes.status, 200);
  assert.equal(retakeRes.json.data.session.photos.length, 4);
  const pos2 = retakeRes.json.data.session.photos.find((p) => p.position === 2);
  const pos1 = retakeRes.json.data.session.photos.find((p) => p.position === 1);
  assert.equal(pos2.is_retaken, true);
  assert.equal(pos1.is_retaken, false);

  // Pengguna Free mengunduh resolusi standard -> 201
  const stdDownloadRes = await apiRequest('/api/downloads', {
    method: 'POST',
    token,
    body: {
      session_id: sessionId,
      format: 'png',
      resolution: 'standard',
    },
  });
  assert.equal(stdDownloadRes.status, 201);
  assert.match(
    stdDownloadRes.json.data.suggested_filename,
    /^photobooth-\d{8}-\d{4}\.png$/
  );

  // Pengguna Free memaksa unduhan HD -> 403 (BE-10)
  const hdDownloadRes = await apiRequest('/api/downloads', {
    method: 'POST',
    token,
    body: {
      session_id: sessionId,
      format: 'png',
      resolution: 'hd',
    },
  });
  assert.equal(hdDownloadRes.status, 403);
  assert.equal(hdDownloadRes.json.error.code, 'HD_DOWNLOAD_REQUIRES_PREMIUM');
});

test('4. Checkout Simulasi, Idempotensi, Akses Premium + HD, dan Reset Demo (BE-13, BE-14, SEC-06)', async () => {
  const loginRes = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'agil@photobooth.edu',
      password: 'PasswordKuat123!',
    },
  });
  const token = loginRes.json.data.token;

  // Cek /api/plans menyertakan is_simulation: true (BE-14)
  const plansRes = await apiRequest('/api/plans');
  assert.equal(plansRes.status, 200);
  assert.equal(plansRes.json.data.is_simulation, true);
  assert.equal(plansRes.json.data.plans.length, 2);

  // SEC-06: Mengirim nomor kartu asli ditolak 400
  const cardDataRes = await apiRequest('/api/subscriptions/checkout', {
    method: 'POST',
    token,
    body: {
      plan_code: 'monthly',
      method: 'card',
      card_number: '4111222233334444',
    },
  });
  assert.equal(cardDataRes.status, 400);
  assert.equal(cardDataRes.json.error.code, 'REAL_PAYMENT_DATA_FORBIDDEN');

  // Checkout dummy Rp19.000/bulan via QRIS -> 201
  const checkoutRes = await apiRequest('/api/subscriptions/checkout', {
    method: 'POST',
    token,
    body: {
      plan_code: 'monthly',
      method: 'qris',
    },
  });
  assert.equal(checkoutRes.status, 201);
  assert.equal(checkoutRes.json.data.is_simulation, true);
  assert.equal(checkoutRes.json.data.tier, 'premium');
  assert.equal(checkoutRes.json.data.payment.status, 'simulated_success');
  assert.equal(checkoutRes.json.data.payment.amount_idr, 19000);

  // BE-13: Checkout kedua saat masih aktif ditolak 409 (tidak tumpang tindih)
  const duplicateCheckoutRes = await apiRequest('/api/subscriptions/checkout', {
    method: 'POST',
    token,
    body: {
      plan_code: 'yearly',
      method: 'ewallet',
    },
  });
  assert.equal(duplicateCheckoutRes.status, 409);
  assert.equal(
    duplicateCheckoutRes.json.error.code,
    'ACTIVE_SUBSCRIPTION_EXISTS'
  );

  // Cek /api/auth/me sekarang tier = 'premium'
  const meAfterCheckout = await apiRequest('/api/auth/me', { token });
  assert.equal(meAfterCheckout.json.data.tier, 'premium');

  // Pengguna Premium bisa memakai layout Grid 2x2 + frame Lavender + filter Vintage + stiker Premium
  const premiumSessionRes = await apiRequest('/api/sessions', {
    method: 'POST',
    token,
    body: {
      template_id: 'grid_2x2',
      frame_id: 'frame_lavender',
      filter_id: 'vintage',
      applied_sticker_ids: ['sticker_pastel_ribbon'],
    },
  });
  assert.equal(premiumSessionRes.status, 201);
  const premSessionId = premiumSessionRes.json.data.session_id;

  // Unggah strip final ke bucket photo-strips & dapatkan signed URL (SEC-05 & BRD 5.4)
  const tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=';
  const uploadRes = await apiRequest(`/api/sessions/${premSessionId}/strip`, {
    method: 'POST',
    token,
    body: {
      image_base64: tinyPngBase64,
      content_type: 'image/png',
    },
  });
  assert.equal(uploadRes.status, 200);
  assert.ok(uploadRes.json.data.session.strip_storage_path.startsWith('photo-strips/'));
  assert.ok(uploadRes.json.data.session.signed_strip_url);

  // Pengguna Premium mengunduh resolusi HD -> 201
  const hdRes = await apiRequest('/api/downloads', {
    method: 'POST',
    token,
    body: {
      session_id: premSessionId,
      format: 'png',
      resolution: 'hd',
    },
  });
  assert.equal(hdRes.status, 201);

  // Reset demo: Berhenti Langganan mengembalikan tier ke Free tanpa menghapus riwayat (BRD 6.3)
  const cancelRes = await apiRequest('/api/subscriptions/cancel', {
    method: 'POST',
    token,
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.json.data.tier, 'free');

  const subMeAfterCancel = await apiRequest('/api/subscriptions/me', { token });
  assert.equal(subMeAfterCancel.json.data.tier, 'free');
  assert.equal(subMeAfterCancel.json.data.active_subscription, null);
  assert.equal(subMeAfterCancel.json.data.history.length, 1);
  assert.equal(subMeAfterCancel.json.data.history[0].status, 'cancelled');
});

test('5. Kepemilikan Data (BE-12): Pengguna lain ditolak 403 saat mengakses sesi milik pengguna pertama', async () => {
  const user1Login = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: 'agil@photobooth.edu', password: 'PasswordKuat123!' },
  });
  const token1 = user1Login.json.data.token;
  const sessions1 = await apiRequest('/api/sessions', { token: token1 });
  const targetSessionId = sessions1.json.data.sessions[0].id;

  // Buat pengguna kedua
  const user2Reg = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      email: 'teman@photobooth.edu',
      password: 'PasswordKuat123!',
      display_name: 'Teman Kelas',
    },
  });
  const token2 = user2Reg.json.data.token;

  // Pengguna ke-2 mencoba membaca detail sesi pengguna ke-1 -> 403
  const forbiddenGet = await apiRequest(`/api/sessions/${targetSessionId}`, {
    token: token2,
  });
  assert.equal(forbiddenGet.status, 403);
  assert.equal(forbiddenGet.json.error.code, 'FORBIDDEN_SESSION_ACCESS');
});

test('6. Integrasi Frontend (aplikasi-photobooth.html), PWA, dan alias kode katalog frontend', async () => {
  // Pastikan halaman utama frontend, manifest, dan service worker dilayani oleh Express
  const htmlRes = await fetch(`${baseUrl}/`);
  assert.equal(htmlRes.status, 200);
  const htmlText = await htmlRes.text();
  assert.ok(htmlText.includes('Photobooth'));

  const manifestRes = await fetch(`${baseUrl}/manifest.webmanifest`);
  assert.equal(manifestRes.status, 200);

  const swRes = await fetch(`${baseUrl}/sw.js`);
  assert.equal(swRes.status, 200);

  // Gunakan akun pengguna ke-2, checkout dengan metode "E-Wallet" (format frontend)
  const loginRes = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: 'teman@photobooth.edu', password: 'PasswordKuat123!' },
  });
  const token = loginRes.json.data.token;

  const checkoutRes = await apiRequest('/api/subscriptions/checkout', {
    method: 'POST',
    token,
    body: {
      plan_code: 'monthly',
      method: 'E-Wallet',
    },
  });
  assert.equal(checkoutRes.status, 201);
  assert.equal(checkoutRes.json.data.payment.method, 'ewallet');

  // Buat sesi menggunakan kunci frontend: layout='polaroid', frame='rainbow', filter='beauty', stickers=['heart','sparkle']
  const feSessionRes = await apiRequest('/api/sessions', {
    method: 'POST',
    token,
    body: {
      template_id: 'polaroid',
      frame_id: 'rainbow',
      filter_id: 'beauty',
      applied_sticker_ids: ['heart', 'sparkle'],
    },
  });
  assert.equal(feSessionRes.status, 201);
  assert.equal(feSessionRes.json.data.session.template.code, 'polaroid');
  assert.equal(feSessionRes.json.data.session.frame.code, 'frame_pelangi_pastel');
  assert.equal(feSessionRes.json.data.session.filter.code, 'soft_beauty');
});

