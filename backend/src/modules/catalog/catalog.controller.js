const catalogService = require('./catalog.service');
const { sendSuccess, asyncHandler } = require('../../utils/response');

const getCatalog = asyncHandler(async (req, res) => {
  const userTier = req.user ? req.user.tier : 'free';
  const catalog = await catalogService.getFullCatalog(userTier);
  return sendSuccess(res, catalog);
});

const getTemplates = asyncHandler(async (req, res) => {
  const userTier = req.user ? req.user.tier : 'free';
  const templates = await catalogService.getTemplates(req.query || {}, userTier);
  return sendSuccess(res, { templates });
});

const getFilters = asyncHandler(async (req, res) => {
  const userTier = req.user ? req.user.tier : 'free';
  const filters = await catalogService.getFilters(req.query || {}, userTier);
  return sendSuccess(res, { filters });
});

const getStickers = asyncHandler(async (req, res) => {
  const userTier = req.user ? req.user.tier : 'free';
  const stickers = await catalogService.getStickers(req.query || {}, userTier);
  return sendSuccess(res, { stickers });
});

module.exports = {
  getCatalog,
  getTemplates,
  getFilters,
  getStickers,
};
