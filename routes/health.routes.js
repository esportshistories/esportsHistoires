const express = require('express');
const path = require('path');
const cors = require('cors');
const { healthCheck } = require(path.join(__dirname, '../controllers/health.controller'));

const router = express.Router();

// CORS options for health endpoint - allow all origins for health checks
const healthCorsOptions = {
  origin: true, // Allow all origins for health checks
  credentials: true,
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200
};

// Handle OPTIONS preflight requests
router.options('/', cors(healthCorsOptions));
router.get('/', cors(healthCorsOptions), healthCheck);

module.exports = router;
