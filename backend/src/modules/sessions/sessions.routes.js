const express = require('express');
const sessionsController = require('./sessions.controller');
const { requireAuth, optionalAuth } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Mulai sesi (mendukung pengguna login maupun tamu untuk item Free; item Premium wajib login + tier Premium)
router.post('/', optionalAuth, sessionsController.createSession);

// Riwayat sesi milik pengguna yang login (BE-12)
router.get('/', requireAuth, sessionsController.listSessions);

// Detail sesi & pembaruan sesi (validasi kepemilikan BE-12 di service)
router.get('/:id', optionalAuth, sessionsController.getSessionById);
router.patch('/:id', optionalAuth, sessionsController.updateSessionById);

// Endpoint penerbitan signed upload URL & unggah strip ke bucket privat photo-strips (BRD 2.1, 5.4, SEC-05)
router.post('/:id/upload-url', optionalAuth, sessionsController.createUploadUrl);
router.post('/:id/strip', optionalAuth, sessionsController.uploadStrip);

module.exports = router;
