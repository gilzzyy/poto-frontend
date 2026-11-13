const sessionsService = require('./sessions.service');
const { sendSuccess, asyncHandler } = require('../../utils/response');

const createSession = asyncHandler(async (req, res) => {
  const session = await sessionsService.createSession(req.user, req.body || {});
  return sendSuccess(
    res,
    {
      ...session,
      session_id: session.id,
      session,
    },
    201
  );
});

const listSessions = asyncHandler(async (req, res) => {
  const sessions = await sessionsService.listMySessions(req.user);
  return sendSuccess(res, { sessions });
});

const getSessionById = asyncHandler(async (req, res) => {
  const session = await sessionsService.getSessionDetail(req.params.id, req.user);
  return sendSuccess(res, { session });
});

const updateSessionById = asyncHandler(async (req, res) => {
  const session = await sessionsService.updateSession(
    req.params.id,
    req.user,
    req.body || {}
  );
  return sendSuccess(res, { session });
});

const createUploadUrl = asyncHandler(async (req, res) => {
  const uploadInfo = await sessionsService.issueStripUploadUrl(
    req.params.id,
    req.user
  );
  return sendSuccess(res, uploadInfo);
});

const uploadStrip = asyncHandler(async (req, res) => {
  const session = await sessionsService.uploadStripImage(
    req.params.id,
    req.user,
    req.body || {}
  );
  return sendSuccess(res, { session });
});

module.exports = {
  createSession,
  listSessions,
  getSessionById,
  updateSessionById,
  createUploadUrl,
  uploadStrip,
};
