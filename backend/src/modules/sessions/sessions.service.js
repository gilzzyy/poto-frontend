const db = require('../../config/supabase');
const { AppError } = require('../../utils/response');

function assertSessionOwnership(session, currentUser) {
  if (!session) {
    throw new AppError(404, 'SESSION_NOT_FOUND', 'Sesi foto tidak ditemukan.');
  }
  // BE-12: Kepemilikan data - sesi milik pengguna tertentu hanya bisa diakses pemiliknya
  if (session.user_id) {
    if (!currentUser || currentUser.id !== session.user_id) {
      throw new AppError(
        403,
        'FORBIDDEN_SESSION_ACCESS',
        'Anda tidak memiliki hak akses ke sesi foto milik pengguna lain.'
      );
    }
  }
}

function assertItemTierAllowed(item, label, effectiveTier) {
  if (item && item.required_tier === 'premium' && effectiveTier !== 'premium') {
    throw new AppError(
      403,
      'PREMIUM_REQUIRED',
      `${label} "${item.name}" hanya tersedia untuk pelanggan Premium.`
    );
  }
}

async function hydrateSessionDetails(session) {
  const [template, frame, filter, signedRead] = await Promise.all([
    session.template_id ? db.findTemplateByIdOrCode(session.template_id) : null,
    session.frame_id ? db.findTemplateByIdOrCode(session.frame_id) : null,
    session.filter_id ? db.findFilterByIdOrCode(session.filter_id) : null,
    session.strip_storage_path
      ? db.createSignedStripReadUrl(session.strip_storage_path)
      : null,
  ]);

  const deterministicPath = db.buildDeterministicStripPath(
    session.user_id,
    session.id
  );

  return {
    ...session,
    session_id: session.id,
    expected_strip_storage_path: deterministicPath,
    signed_strip_url: signedRead ? signedRead.signed_url : null,
    signed_url_expires_in: signedRead ? signedRead.expires_in : null,
    template: template || null,
    frame: frame || null,
    filter: filter || null,
  };
}

async function createSession(currentUser, body = {}) {
  const userTier = currentUser ? currentUser.tier : 'free';

  const templateKey =
    body.template_id || body.layout_id || body.template_code || body.layout_code;
  if (!templateKey) {
    throw new AppError(
      400,
      'TEMPLATE_REQUIRED',
      'template_id (atau layout_code) wajib dipilih untuk memulai sesi foto.'
    );
  }

  const template = await db.findTemplateByIdOrCode(templateKey);
  if (!template) {
    throw new AppError(
      404,
      'TEMPLATE_NOT_FOUND',
      `Template "${templateKey}" tidak ditemukan atau tidak aktif.`
    );
  }

  // BE-10: Validasi gating Premium untuk template/layout
  assertItemTierAllowed(template, 'Template', userTier);

  // Opsional: frame terpisah jika dikirim frame_id / frame_code
  let frame = null;
  const frameKey = body.frame_id || body.frame_code;
  if (frameKey) {
    frame = await db.findTemplateByIdOrCode(frameKey);
    if (!frame || frame.kind !== 'frame') {
      throw new AppError(
        404,
        'FRAME_NOT_FOUND',
        `Frame "${frameKey}" tidak ditemukan.`
      );
    }
    assertItemTierAllowed(frame, 'Frame', userTier);
  }

  // Filter (default ke 'normal' bila tidak dikirim)
  const filterKey = body.filter_id || body.filter_code || 'normal';
  const filter = await db.findFilterByIdOrCode(filterKey);
  if (!filter) {
    throw new AppError(
      404,
      'FILTER_NOT_FOUND',
      `Filter "${filterKey}" tidak ditemukan.`
    );
  }
  assertItemTierAllowed(filter, 'Filter', userTier);

  // Stickers
  let stickerIds = [];
  if (body.applied_sticker_ids !== undefined) {
    if (!Array.isArray(body.applied_sticker_ids)) {
      throw new AppError(
        400,
        'INVALID_STICKER_IDS',
        'applied_sticker_ids harus berupa array.'
      );
    }
    if (body.applied_sticker_ids.length > 0) {
      const matchedStickers = await db.findStickersByIdsOrCodes(
        body.applied_sticker_ids
      );
      if (matchedStickers.length !== body.applied_sticker_ids.length) {
        throw new AppError(
          404,
          'STICKER_NOT_FOUND',
          'Salah satu stiker yang dipilih tidak ditemukan di katalog aktif.'
        );
      }
      for (const sticker of matchedStickers) {
        assertItemTierAllowed(sticker, 'Stiker', userTier);
      }
      stickerIds = matchedStickers.map((s) => s.id);
    }
  }

  const created = await db.createPhotoSession({
    user_id: currentUser ? currentUser.id : null,
    template_id: template.id,
    logical_template_code: template.code,
    photo_count: template.photo_count || 4,
    frame_id: frame ? frame.id : null,
    filter_id: filter.id,
    applied_sticker_ids: stickerIds,
    tier_at_session: userTier,
  });

  const fullSession = await db.findSessionById(created.id);
  return hydrateSessionDetails(fullSession);
}

async function listMySessions(currentUser) {
  const sessions = await db.listSessionsByUser(currentUser.id);
  return Promise.all(sessions.map((s) => hydrateSessionDetails(s)));
}

async function getSessionDetail(sessionId, currentUser) {
  const session = await db.findSessionById(sessionId);
  assertSessionOwnership(session, currentUser);
  return hydrateSessionDetails(session);
}

async function updateSession(sessionId, currentUser, body = {}) {
  const session = await db.findSessionById(sessionId);
  assertSessionOwnership(session, currentUser);

  // BRD 6.3: Konten Premium yang sudah dipakai dalam sesi yang sedang berjalan
  // tidak dicabut di tengah sesi saat langganan berakhir
  const liveTier = currentUser ? currentUser.tier : 'free';
  const effectiveTier =
    liveTier === 'premium' || session.tier_at_session === 'premium'
      ? 'premium'
      : 'free';

  const template = await db.findTemplateByIdOrCode(session.template_id);
  const maxPhotos = template?.photo_count || 4;

  const updates = {};

  // Update frame bila ada
  const frameKey = body.frame_id || body.frame_code;
  if (frameKey !== undefined) {
    if (frameKey === null) {
      updates.frame_id = null;
    } else {
      const frame = await db.findTemplateByIdOrCode(frameKey);
      if (!frame || frame.kind !== 'frame') {
        throw new AppError(404, 'FRAME_NOT_FOUND', `Frame "${frameKey}" tidak ditemukan.`);
      }
      assertItemTierAllowed(frame, 'Frame', effectiveTier);
      updates.frame_id = frame.id;
    }
  }

  // Update filter bila ada
  const filterKey = body.filter_id || body.filter_code;
  if (filterKey !== undefined) {
    const filter = await db.findFilterByIdOrCode(filterKey);
    if (!filter) {
      throw new AppError(404, 'FILTER_NOT_FOUND', `Filter "${filterKey}" tidak ditemukan.`);
    }
    assertItemTierAllowed(filter, 'Filter', effectiveTier);
    updates.filter_id = filter.id;
  }

  // Update stickers bila ada
  if (body.applied_sticker_ids !== undefined) {
    if (!Array.isArray(body.applied_sticker_ids)) {
      throw new AppError(
        400,
        'INVALID_STICKER_IDS',
        'applied_sticker_ids harus berupa array.'
      );
    }
    const matchedStickers = await db.findStickersByIdsOrCodes(
      body.applied_sticker_ids
    );
    if (matchedStickers.length !== body.applied_sticker_ids.length) {
      throw new AppError(
        404,
        'STICKER_NOT_FOUND',
        'Salah satu stiker yang dipilih tidak ditemukan.'
      );
    }
    for (const sticker of matchedStickers) {
      assertItemTierAllowed(sticker, 'Stiker', effectiveTier);
    }
    updates.applied_sticker_ids = matchedStickers.map((s) => s.id);
  }

  // Catat slot foto atau retake foto satuan (BRD 5.3 & PRD FR-08)
  const photoEntries = [];
  if (Array.isArray(body.photos)) {
    photoEntries.push(...body.photos);
  }
  if (body.retake_position !== undefined) {
    photoEntries.push({
      position: Number(body.retake_position),
      storage_path: body.photo_storage_path || null,
      is_retaken: true,
    });
  } else if (body.position !== undefined) {
    photoEntries.push({
      position: Number(body.position),
      storage_path: body.photo_storage_path || null,
      is_retaken: Boolean(body.is_retaken),
    });
  }

  for (const item of photoEntries) {
    const pos = Number(item.position);
    if (!Number.isInteger(pos) || pos < 1 || pos > maxPhotos) {
      throw new AppError(
        400,
        'INVALID_PHOTO_POSITION',
        `Posisi foto harus berupa bilangan bulat antara 1 sampai ${maxPhotos}.`
      );
    }
    await db.upsertSessionPhoto({
      session_id: session.id,
      position: pos,
      storage_path: item.storage_path !== undefined ? item.storage_path : undefined,
      is_retaken: Boolean(item.is_retaken),
    });
  }

  // Update strip_storage_path (penamaan deterministik photo-strips/{user_id}/{session_id}.png)
  if (body.strip_storage_path !== undefined) {
    if (body.strip_storage_path !== null && typeof body.strip_storage_path !== 'string') {
      throw new AppError(
        400,
        'INVALID_STRIP_PATH',
        'strip_storage_path harus berupa string path Storage.'
      );
    }
    // Normalisasi ke path deterministik bila klien mengirim boolean/placeholder atau path valid
    const deterministicPath = db.buildDeterministicStripPath(
      session.user_id,
      session.id
    );
    updates.strip_storage_path = body.strip_storage_path
      ? deterministicPath
      : null;
  }

  // Update status sesi ('in_progress' / 'completed')
  if (body.status !== undefined) {
    if (!['in_progress', 'completed'].includes(body.status)) {
      throw new AppError(
        400,
        'INVALID_SESSION_STATUS',
        "Status sesi hanya boleh 'in_progress' atau 'completed'."
      );
    }
    updates.status = body.status;
    if (body.status === 'completed') {
      updates.completed_at = new Date().toISOString();
      if (!updates.strip_storage_path && !session.strip_storage_path) {
        updates.strip_storage_path = db.buildDeterministicStripPath(
          session.user_id,
          session.id
        );
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.updatePhotoSession(session.id, updates);
  }

  const refreshed = await db.findSessionById(session.id);
  return hydrateSessionDetails(refreshed);
}

async function issueStripUploadUrl(sessionId, currentUser) {
  const session = await db.findSessionById(sessionId);
  assertSessionOwnership(session, currentUser);
  return db.createSignedStripUploadUrl(session.user_id, session.id);
}

async function uploadStripImage(sessionId, currentUser, body = {}) {
  const session = await db.findSessionById(sessionId);
  assertSessionOwnership(session, currentUser);

  const rawData = body.image_base64 || body.data_url;
  if (!rawData || typeof rawData !== 'string') {
    throw new AppError(
      400,
      'IMAGE_DATA_REQUIRED',
      'image_base64 (atau data_url) wajib dikirim untuk mengunggah strip final.'
    );
  }

  let contentType = body.content_type || 'image/png';
  let base64Payload = rawData.trim();
  const dataUrlMatch = base64Payload.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i);
  if (dataUrlMatch) {
    contentType = dataUrlMatch[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : dataUrlMatch[1].toLowerCase();
    base64Payload = dataUrlMatch[2];
  }

  const buffer = Buffer.from(base64Payload, 'base64');
  if (!buffer || buffer.length === 0) {
    throw new AppError(400, 'INVALID_IMAGE_DATA', 'Data gambar base64 tidak valid.');
  }

  const storagePath = await db.uploadStripBuffer(
    session.user_id,
    session.id,
    buffer,
    contentType
  );

  await db.updatePhotoSession(session.id, {
    strip_storage_path: storagePath,
    status: 'completed',
    completed_at: new Date().toISOString(),
  });

  const refreshed = await db.findSessionById(session.id);
  return hydrateSessionDetails(refreshed);
}

module.exports = {
  createSession,
  listMySessions,
  getSessionDetail,
  updateSession,
  issueStripUploadUrl,
  uploadStripImage,
  assertSessionOwnership,
};
