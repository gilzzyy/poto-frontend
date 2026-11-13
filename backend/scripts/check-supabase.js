const http = require('http');
const app = require('../src/app');
const db = require('../src/config/supabase');
const env = require('../src/config/env');

function apiCall(server, method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const headers = { Accept: 'application/json' };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, json, raw });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function verifyLiveSupabase() {
  console.log('======================================================');
  console.log('Verifikasi Koneksi Supabase & End-to-End API Photobooth');
  console.log('======================================================');
  console.log('SUPABASE_URL :', env.SUPABASE_URL);
  console.log('Mode Koneksi :', db.isSupabaseConnected ? 'LIVE SUPABASE' : 'IN-MEMORY FALLBACK');

  if (!db.isSupabaseConnected) {
    console.error('Gagal: SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum terkonfigurasi.');
    process.exit(1);
  }

  const [plans, templates, filters, stickers] = await Promise.all([
    db.listActivePlans(),
    db.listActiveTemplates(),
    db.listActiveFilters(),
    db.listActiveStickers(),
  ]);

  const layouts = templates.filter((t) => t.kind === 'layout');
  const frames = templates.filter((t) => t.kind === 'frame');

  console.log('\n[1] Katalog & Paket Langganan Live:');
  console.log(`  - Paket Langganan : ${plans.length} paket (${plans.map((p) => `${p.code}: Rp${p.price_idr}`).join(', ')})`);
  console.log(`  - Layout Template : ${layouts.length} layout (${layouts.map((l) => `${l.code}[${l.required_tier}]`).join(', ')})`);
  console.log(`  - Frame Warna     : ${frames.length} frame (${frames.map((f) => `${f.frontend_key}[${f.required_tier}]`).join(', ')})`);
  console.log(`  - Filter Kamera   : ${filters.length} filter (${filters.map((f) => `${f.frontend_key}[${f.required_tier}]`).join(', ')})`);
  console.log(`  - Stiker Dekorasi : ${stickers.length} stiker (${stickers.map((s) => `${s.frontend_key}${s.emoji}[${s.required_tier}]`).join(', ')})`);

  const { data: buckets, error: bucketErr } = await db.supabaseClient.storage.listBuckets();
  if (bucketErr) {
    throw new Error(`Gagal memeriksa bucket Storage: ${bucketErr.message}`);
  }
  console.log('\n[2] Supabase Storage Buckets:');
  for (const b of buckets || []) {
    console.log(`  - ${b.name} (public: ${b.public})`);
  }

  // [3] End-to-End API & Database Check
  console.log('\n[3] Pengujian End-to-End REST API ke Database & Storage Supabase:');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let testUserId = null;
  let testSessionId = null;
  let uploadedObjectKey = null;

  try {
    const uniqueEmail = `e2e.verify.${Date.now()}@photobooth.id`;
    const regRes = await apiCall(server, 'POST', '/api/auth/register', {
      body: {
        email: uniqueEmail,
        password: 'password123',
        display_name: 'E2E Verifier',
      },
    });
    if (regRes.status !== 201) {
      throw new Error(`Register gagal (${regRes.status}): ${regRes.raw}`);
    }
    const token = regRes.json.data.access_token;
    testUserId = regRes.json.data.user.id;
    console.log(`  - POST /api/auth/register          : OK (user_id: ${testUserId})`);

    const sessRes = await apiCall(server, 'POST', '/api/sessions', {
      token,
      body: {
        template_id: 'strip4',
        frame_id: 'pink',
        filter_id: 'warm',
        applied_sticker_ids: ['heart', 'flower'],
      },
    });
    if (sessRes.status !== 201) {
      throw new Error(`Create session gagal (${sessRes.status}): ${sessRes.raw}`);
    }
    testSessionId = sessRes.json.data.id;
    console.log(`  - POST /api/sessions               : OK (session_id: ${testSessionId})`);

    const retakeRes = await apiCall(server, 'PATCH', `/api/sessions/${testSessionId}`, {
      token,
      body: {
        retake_position: 1,
      },
    });
    if (retakeRes.status !== 200) {
      throw new Error(`Retake gagal (${retakeRes.status}): ${retakeRes.raw}`);
    }
    console.log('  - PATCH /api/sessions/:id (retake) : OK');

    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const stripRes = await apiCall(server, 'POST', `/api/sessions/${testSessionId}/strip`, {
      token,
      body: { data_url: tinyPng },
    });
    if (stripRes.status !== 200) {
      throw new Error(`Upload strip gagal (${stripRes.status}): ${stripRes.raw}`);
    }
    uploadedObjectKey = `${testUserId}/${testSessionId}.png`;
    const stripPath = stripRes.json.data.session?.strip_storage_path || stripRes.json.data.strip_storage_path;
    console.log(`  - POST /api/sessions/:id/strip     : OK (${stripPath})`);

    const dlRes = await apiCall(server, 'POST', '/api/downloads', {
      token,
      body: {
        session_id: testSessionId,
        format: 'png',
        resolution: 'standard',
      },
    });
    if (dlRes.status !== 201) {
      throw new Error(`Download gagal (${dlRes.status}): ${dlRes.raw}`);
    }
    console.log(`  - POST /api/downloads              : OK (resolution: ${dlRes.json.data.download?.resolution})`);

    const subRes = await apiCall(server, 'POST', '/api/subscriptions/checkout', {
      token,
      body: {
        plan_code: 'monthly',
        method: 'qris',
      },
    });
    if (subRes.status !== 201) {
      throw new Error(`Checkout gagal (${subRes.status}): ${subRes.raw}`);
    }
    console.log(`  - POST /api/subscriptions/checkout : OK (tier: ${subRes.json.data.tier}, status: ${subRes.json.data.payment.status})`);

    const cancelRes = await apiCall(server, 'POST', '/api/subscriptions/cancel', {
      token,
    });
    if (cancelRes.status !== 200) {
      throw new Error(`Cancel gagal (${cancelRes.status}): ${cancelRes.raw}`);
    }
    console.log(`  - POST /api/subscriptions/cancel   : OK (tier kembali ke: ${cancelRes.json.data.tier})`);
  } finally {
    // Bersihkan data uji E2E agar database tetap bersih
    if (uploadedObjectKey) {
      await db.supabaseClient.storage.from(env.SUPABASE_STRIPS_BUCKET).remove([uploadedObjectKey]);
    }
    if (testSessionId) {
      await db.supabaseClient.from('downloads').delete().eq('session_id', testSessionId);
      await db.supabaseClient.from('photos').delete().eq('session_id', testSessionId);
      await db.supabaseClient.from('photo_sessions').delete().eq('id', testSessionId);
    }
    if (testUserId) {
      await db.supabaseClient.from('payments_simulation').delete().eq('user_id', testUserId);
      await db.supabaseClient.from('subscriptions').delete().eq('user_id', testUserId);
      await db.supabaseClient.from('users').delete().eq('id', testUserId);
    }
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('\n[4] Seluruh verifikasi live Supabase selesai dengan SUKSES!');
}

verifyLiveSupabase().catch((err) => {
  console.error('Verifikasi gagal:', err);
  process.exit(1);
});
