const downloadsService = require('./downloads.service');
const { sendSuccess, asyncHandler } = require('../../utils/response');

const createDownload = asyncHandler(async (req, res) => {
  const result = await downloadsService.recordDownload(
    req.user,
    req.body || {}
  );
  return sendSuccess(res, result, 201);
});

const listDownloads = asyncHandler(async (req, res) => {
  const downloads = await downloadsService.listMyDownloads(req.user);
  return sendSuccess(res, { downloads });
});

module.exports = {
  createDownload,
  listDownloads,
};
