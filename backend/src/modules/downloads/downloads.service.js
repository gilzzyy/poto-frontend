const db = require('../../config/supabase');
const { assertSessionOwnership } = require('../sessions/sessions.service');
const { AppError } = require('../../utils/response');

function buildPhotoboothFilename(dateIso, format) {
  const d = dateIso ? new Date(dateIso) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `photobooth-${yyyy}${mm}${dd}-${hh}${min}.${format}`;
}

async function recordDownload(currentUser, body = {}) {
  const { session_id } = body;
  if (!session_id) {
    throw new AppError(
      400,
      'SESSION_ID_REQUIRED',
      'session_id wajib dikirim saat mencatat unduhan.'
    );
  }

  const rawFormat = String(body.format || 'png')
    .trim()
    .toLowerCase();
  const format = rawFormat === 'jpeg' ? 'jpg' : rawFormat;
  if (!['png', 'jpg'].includes(format)) {
    throw new AppError(
      400,
      'INVALID_FORMAT',
      "Format unduhan hanya boleh 'png' atau 'jpg'."
    );
  }

  const rawResolution = String(body.resolution || 'standard')
    .trim()
    .toLowerCase();
  const resolution = rawResolution === 'high' ? 'hd' : rawResolution;
  if (!['standard', 'hd'].includes(resolution)) {
    throw new AppError(
      400,
      'INVALID_RESOLUTION',
      "Resolusi unduhan hanya boleh 'standard' atau 'hd'."
    );
  }

  const session = await db.findSessionById(session_id);
  // BE-12: Validasi kepemilikan sesi
  assertSessionOwnership(session, currentUser);

  // BE-10 & BRD 6.3: Validasi hak HD terhadap tier aktif atau tier_at_session
  const liveTier = currentUser ? currentUser.tier : 'free';
  const effectiveTier =
    liveTier === 'premium' || session.tier_at_session === 'premium'
      ? 'premium'
      : 'free';

  if (resolution === 'hd' && effectiveTier !== 'premium') {
    throw new AppError(
      403,
      'HD_DOWNLOAD_REQUIRES_PREMIUM',
      'Unduhan resolusi HD hanya tersedia untuk pelanggan Premium.'
    );
  }

  const download = await db.createDownloadRecord({
    session_id: session.id,
    user_id: currentUser ? currentUser.id : session.user_id || null,
    format,
    resolution,
  });

  const signedRead = session.strip_storage_path
    ? await db.createSignedStripReadUrl(session.strip_storage_path)
    : null;

  return {
    download,
    suggested_filename: buildPhotoboothFilename(session.created_at, format),
    signed_strip_url: signedRead ? signedRead.signed_url : null,
    signed_url_expires_in: signedRead ? signedRead.expires_in : null,
  };
}

async function listMyDownloads(currentUser) {
  const downloads = await db.listDownloadsByUser(currentUser.id);
  return downloads.map((d) => ({
    ...d,
    suggested_filename: buildPhotoboothFilename(
      d.session?.created_at || d.downloaded_at,
      d.format
    ),
  }));
}

module.exports = {
  recordDownload,
  listMyDownloads,
};
