const db = require('../../config/supabase');
const { sanitizeUserResponse } = require('../auth/auth.service');
const { AppError } = require('../../utils/response');

async function getMyProfile(currentUser) {
  const user = await db.findUserById(currentUser.id);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan.');
  }
  const { tier, activeSubscription } = await db.deriveUserTier(user.id);
  return sanitizeUserResponse(user, tier, activeSubscription);
}

async function updateMyProfile(currentUser, body = {}) {
  // BE-11: Tier tidak boleh diubah langsung oleh klien
  if (body.tier !== undefined) {
    throw new AppError(
      403,
      'TIER_MODIFICATION_FORBIDDEN',
      'Status tier tidak dapat diubah secara langsung; tier diturunkan dari langganan aktif.'
    );
  }

  const updates = {};

  if (body.display_name !== undefined) {
    if (
      typeof body.display_name !== 'string' ||
      body.display_name.trim().length < 1 ||
      body.display_name.trim().length > 80
    ) {
      throw new AppError(
        400,
        'INVALID_DISPLAY_NAME',
        'Nama tampilan harus berupa teks (1-80 karakter).'
      );
    }
    updates.display_name = body.display_name.trim();
  }

  if (body.avatar_path !== undefined) {
    if (body.avatar_path !== null && typeof body.avatar_path !== 'string') {
      throw new AppError(
        400,
        'INVALID_AVATAR_PATH',
        'avatar_path harus berupa string path Storage atau null.'
      );
    }
    updates.avatar_path = body.avatar_path ? body.avatar_path.trim() : null;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError(
      400,
      'EMPTY_UPDATE',
      'Minimal satu field (display_name atau avatar_path) harus dikirim untuk diperbarui.'
    );
  }

  const updated = await db.updateUser(currentUser.id, updates);
  const { tier, activeSubscription } = await db.deriveUserTier(updated.id);
  return sanitizeUserResponse(updated, tier, activeSubscription);
}

module.exports = {
  getMyProfile,
  updateMyProfile,
};
