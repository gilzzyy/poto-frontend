const db = require('../../config/supabase');
const { AppError } = require('../../utils/response');

function enrichItemForTier(item, userTier = 'free') {
  const isPremiumItem = item.required_tier === 'premium';
  const isLocked = isPremiumItem && userTier !== 'premium';
  return {
    ...item,
    is_premium: isPremiumItem,
    is_locked: isLocked,
  };
}

async function getFullCatalog(userTier = 'free') {
  const [templates, filters, stickers] = await Promise.all([
    db.listActiveTemplates(),
    db.listActiveFilters(),
    db.listActiveStickers(),
  ]);

  const enrichedTemplates = templates.map((t) => enrichItemForTier(t, userTier));
  const layouts = enrichedTemplates.filter((t) => t.kind === 'layout');
  const frames = enrichedTemplates.filter((t) => t.kind === 'frame');
  const enrichedFilters = filters.map((f) => enrichItemForTier(f, userTier));
  const enrichedStickers = stickers.map((s) => enrichItemForTier(s, userTier));

  return {
    user_tier: userTier,
    templates: enrichedTemplates,
    layouts,
    frames,
    filters: enrichedFilters,
    stickers: enrichedStickers,
  };
}

async function getTemplates({ kind, tier } = {}, userTier = 'free') {
  if (kind && !['layout', 'frame'].includes(kind)) {
    throw new AppError(
      400,
      'INVALID_TEMPLATE_KIND',
      "Parameter 'kind' hanya boleh bernilai 'layout' atau 'frame'."
    );
  }
  if (tier && !['free', 'premium'].includes(tier)) {
    throw new AppError(
      400,
      'INVALID_TIER_FILTER',
      "Parameter 'tier' hanya boleh bernilai 'free' atau 'premium'."
    );
  }

  let templates = await db.listActiveTemplates(kind || null);
  if (tier) {
    templates = templates.filter((t) => t.required_tier === tier);
  }
  return templates.map((t) => enrichItemForTier(t, userTier));
}

async function getFilters({ tier } = {}, userTier = 'free') {
  if (tier && !['free', 'premium'].includes(tier)) {
    throw new AppError(
      400,
      'INVALID_TIER_FILTER',
      "Parameter 'tier' hanya boleh bernilai 'free' atau 'premium'."
    );
  }
  let filters = await db.listActiveFilters();
  if (tier) {
    filters = filters.filter((f) => f.required_tier === tier);
  }
  return filters.map((f) => enrichItemForTier(f, userTier));
}

async function getStickers({ tier, category } = {}, userTier = 'free') {
  if (tier && !['free', 'premium'].includes(tier)) {
    throw new AppError(
      400,
      'INVALID_TIER_FILTER',
      "Parameter 'tier' hanya boleh bernilai 'free' atau 'premium'."
    );
  }
  let stickers = await db.listActiveStickers();
  if (tier) {
    stickers = stickers.filter((s) => s.required_tier === tier);
  }
  if (category) {
    stickers = stickers.filter((s) => s.category === category);
  }
  return stickers.map((s) => enrichItemForTier(s, userTier));
}

module.exports = {
  getFullCatalog,
  getTemplates,
  getFilters,
  getStickers,
};
