const express = require('express');
const downloadsController = require('./downloads.controller');
const { requireAuth, optionalAuth } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/', optionalAuth, downloadsController.createDownload);
router.get('/', requireAuth, downloadsController.listDownloads);

module.exports = router;
