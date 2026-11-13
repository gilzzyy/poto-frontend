const express = require('express');
const catalogController = require('./catalog.controller');
const { optionalAuth } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get('/', optionalAuth, catalogController.getCatalog);
router.get('/templates', optionalAuth, catalogController.getTemplates);
router.get('/filters', optionalAuth, catalogController.getFilters);
router.get('/stickers', optionalAuth, catalogController.getStickers);

module.exports = router;
